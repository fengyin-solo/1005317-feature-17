import { listRows, saveRows } from '@/data/local-store'
import { appendLedgerEntries, hasLedgerEntry } from '@/data/ledger-store'
import {
  ACTION_TARGET,
  ACTIONS,
  canTransition,
  carbonSeedCount,
  FIELDS,
  FLOTATION_KEY,
  flotationDate,
  missingFields,
  parseWeight,
  sampleCode,
  STATUSES,
  WEIGHT_LIMIT_KG,
} from '@/data/flotation'
import type { BatchActionResult, BatchItemOutcome, EntryRow, LedgerRow } from '@/data/types'
const OVERWEIGHT_FLAG = '超限标注'

/** 浮选样品是否已被标过重量超限。 */
export function overweightFlag(row: EntryRow): string {
  return String(row[OVERWEIGHT_FLAG] ?? '')
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * 浮选批量动作：勾住多条一起投，逐条给出处理结果。
 * 缺重量/日期、超重量上限的只拦下自己这一条，不挡整批；
 * 同一样品编号在一批里只处理一条；状态必须逐级推进。
 */
export function runFlotationBatch(ids: number[], action: string): BatchActionResult {
  const target = ACTION_TARGET[action]
  const rows = listRows(FLOTATION_KEY)
  const outcomes: BatchItemOutcome[] = []
  const seenCodes = new Set<string>()
  const ledgerDrafts: Omit<LedgerRow, 'id' | 'ledgerNo'>[] = []
  let nextRows = [...rows]

  for (const id of ids) {
    const index = nextRows.findIndex((row) => Number(row.id) === id)
    if (index < 0) {
      outcomes.push({
        id,
        code: '—',
        ok: false,
        status: '—',
        kind: 'blocked',
        reason: `没有找到编号为 ${id} 的浮选样品`,
      })
      continue
    }

    const row = nextRows[index]
    const code = sampleCode(row)
    const fromStatus = String(row.status)

    // 同一样品编号在本次勾选里重复出现：只算第一条，本条挑出不处理。
    if (code && seenCodes.has(code)) {
      outcomes.push({
        id: Number(row.id),
        code,
        ok: false,
        status: fromStatus,
        kind: 'duplicate',
        reason: `样品编号 ${code} 在本批已提交过，同一样品只走一遍，本条不重复处理`,
      })
      continue
    }

    // 逐级推进：已完成再提交浮选要明确拦下并说明；越级同样拦下。
    if (!canTransition(fromStatus, action)) {
      let reason = `浮选环节只能逐级推进（待浮选→浮选中→已完成→已废弃），当前为「${fromStatus}」，不能执行「${action}」`
      if (fromStatus === STATUSES.done && action === ACTIONS.submit) {
        reason = `样品 ${code} 已完成浮选并出结果，不能再提交浮选走第二遍；如需补做请另行登记新样品`
      } else if (fromStatus === STATUSES.abandoned) {
        reason = `样品 ${code} 已废弃，流程已终止，不能再执行「${action}」`
      }
      outcomes.push({
        id: Number(row.id),
        code,
        ok: false,
        status: fromStatus,
        kind: 'blocked',
        reason,
      })
      continue
    }

    if (code) {
      seenCodes.add(code)
    }

    // 投入浮选前缺重量或缺浮选日期的，挑出来放一旁，不挡整批。
    if (action === ACTIONS.submit) {
      const missing = missingFields(row)
      if (missing.length > 0) {
        outcomes.push({
          id: Number(row.id),
          code,
          ok: false,
          status: fromStatus,
          kind: 'missing',
          reason: `缺少${missing.join('、')}，资料不全先放一旁，补齐后再投浮选`,
        })
        continue
      }

      // 重量阈值：超限的整件拦下，并在样品上留下单独标注。
      const weight = parseWeight(row)
      if (weight !== null && weight > WEIGHT_LIMIT_KG) {
        const flag = `重量超限：${weight}kg ＞ 上限 ${WEIGHT_LIMIT_KG}kg`
        nextRows[index] = { ...row, [OVERWEIGHT_FLAG]: flag }
        outcomes.push({
          id: Number(row.id),
          code,
          ok: false,
          status: fromStatus,
          kind: 'overweight',
          reason: `${flag}，按阈值拦下，不得投入浮选`,
        })
        continue
      }
    }

    // 校验通过：推进到下一级状态。
    const terminal = target === STATUSES.done || target === STATUSES.abandoned
    const updated: EntryRow = {
      ...row,
      status: target,
      pending: !terminal,
      abnormal: target === STATUSES.abandoned ? true : row.abnormal,
    }
    nextRows[index] = updated

    // 确认完成（办结）的结果落进送检台账，同一样品只记一条。
    if (action === ACTIONS.complete && code && !hasLedgerEntry(code)) {
      ledgerDrafts.push({
        sampleCode: code,
        samplingUnit: String(row[FIELDS.unit] ?? ''),
        sampleWeight: parseWeight(row),
        flotationDate: flotationDate(row),
        carbonSeeds: carbonSeedCount(row),
        destination: String(row[FIELDS.destination] ?? ''),
        archivedAt: today(),
      })
    }

    outcomes.push({
      id: Number(row.id),
      code,
      ok: true,
      status: target,
      kind: 'success',
      reason: `已${action}，状态推进为「${target}」`,
    })
  }

  saveRows(FLOTATION_KEY, nextRows)
  if (ledgerDrafts.length > 0) {
    appendLedgerEntries(ledgerDrafts)
  }

  const successCount = outcomes.filter((item) => item.ok).length
  const overweightItems = outcomes.filter((item) => item.kind === 'overweight')
  const skipCount = outcomes.length - successCount
  const message = summarize(action, outcomes.length, successCount, skipCount)

  return {
    ok: successCount > 0,
    message,
    action,
    items: outcomes,
    successCount,
    skipCount,
    overweightItems,
  }
}

function summarize(
  action: string,
  total: number,
  successCount: number,
  skipCount: number,
): string {
  if (successCount === 0) {
    return `本批 ${total} 条样品均未能${action}，请查看逐条原因`
  }
  if (skipCount === 0) {
    return `本批 ${total} 条全部${action}成功`
  }
  return `本批 ${total} 条：${successCount} 条已${action}，${skipCount} 条被拦下未处理，详见逐条结果`
}
