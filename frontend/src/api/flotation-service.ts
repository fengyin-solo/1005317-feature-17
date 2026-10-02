import {
  carbonizedSeedCount,
  COMPLETE_ACTION,
  DISCARD_ACTION,
  FINAL_STATUS,
  FLOTATION_KEY,
  guardTransition,
  isDateMissing,
  isWeightMissing,
  sampleCode,
  sampleWeight,
  SUBMIT_ACTION,
  targetStatus,
  WEIGHT_LIMIT_KG,
} from '@/data/flotation-domain'
import { listLedger, listRows, saveLedger, saveRows } from '@/data/local-store'
import type { ActionResult, BatchResult, EntryRow, ItemResult, LedgerEntry } from '@/data/types'

// 浮选样品批量动作：整批一次提交，逐条给出结论，缺料/超限/越态都不挡住其它样品。
export function batchFlotationAction(ids: number[], action: string): BatchResult {
  const empty: BatchResult = {
    ok: true,
    accepted: [],
    rejected: [],
    setAside: [],
    duplicates: [],
  }
  if (ids.length === 0) {
    return { ...empty, ok: false }
  }

  const rows = listRows(FLOTATION_KEY)
  const selected: EntryRow[] = []
  const missing: ItemResult[] = []
  // 同一样品再次提交只算一条：入参里重复的 id 先去掉，再按样品编号去重。
  for (const id of Array.from(new Set(ids))) {
    const row = rows.find((item) => Number(item.id) === id)
    if (!row) {
      missing.push({ id, code: `#${id}`, outcome: 'rejected', message: '没有找到这条浮选样品' })
      continue
    }
    selected.push(row)
  }

  // 同一样品编号在本批里再次提交只算一条：后面的重复条目标出来，不重复走流程。
  const seenCodes = new Set<string>()
  const unique: EntryRow[] = []
  const duplicates: ItemResult[] = []
  for (const row of selected) {
    const code = sampleCode(row)
    if (seenCodes.has(code)) {
      duplicates.push({
        id: Number(row.id),
        code,
        outcome: 'rejected',
        message: `样品编号 ${code} 在本批中重复，按一条处理，本条跳过`,
      })
      continue
    }
    seenCodes.add(code)
    unique.push(row)
  }

  // 同一样品编号在台账里已有办结记录，也不再重复走浮选。
  const settledCodes = new Set(listLedger().map((entry) => entry.样品编号))

  const accepted: ItemResult[] = []
  const rejected: ItemResult[] = [...missing, ...duplicates]
  const setAside: ItemResult[] = []
  const updatedById = new Map<number, EntryRow>()

  for (const row of unique) {
    const id = Number(row.id)
    const code = sampleCode(row)
    const guard = guardTransition(row, action)
    if (!guard.ok) {
      rejected.push({ id, code, outcome: 'rejected', message: guard.message })
      continue
    }

    // 提交浮选前，样品重量或浮选日期缺失的挑到一旁补齐，不挡住整批。
    if (action === SUBMIT_ACTION) {
      const lack: string[] = []
      if (isWeightMissing(row)) {
        lack.push('样品重量')
      }
      if (isDateMissing(row)) {
        lack.push('浮选日期')
      }
      if (lack.length > 0) {
        setAside.push({
          id,
          code,
          outcome: 'set-aside',
          message: `样品 ${code} 缺${lack.join('、')}，已挑出待补，未投浮选`,
        })
        continue
      }
    }

    // 办结入台账前按重量阈值拦下超限件，并在样品上单独标注。
    let overweight = false
    if (action === COMPLETE_ACTION) {
      const weight = sampleWeight(row)
      if (weight !== null && weight > WEIGHT_LIMIT_KG) {
        overweight = true
        rejected.push({
          id,
          code,
          outcome: 'rejected',
          message: `样品 ${code} 重量 ${weight}kg 超过单样上限 ${WEIGHT_LIMIT_KG}kg，已拦截并标注超限，暂不入送检台账`,
        })
        updatedById.set(id, { ...row, abnormal: true, 超限: true })
        continue
      }
      if (settledCodes.has(code)) {
        rejected.push({
          id,
          code,
          outcome: 'rejected',
          message: `样品 ${code} 已在送检台账办结，不重复入账`,
        })
        continue
      }
    }

    const target = targetStatus(action)
    const updated: EntryRow = {
      ...row,
      status: target,
      pending: target !== FINAL_STATUS,
      abnormal: action === DISCARD_ACTION ? true : row.abnormal,
    }
    updatedById.set(id, updated)
    const verb =
      action === SUBMIT_ACTION ? '已投入浮选，状态「浮选中」'
      : action === COMPLETE_ACTION ? '浮选完成，结果已落入送检台账'
      : '已登记废弃'
    accepted.push({ id, code, outcome: 'accepted', message: `样品 ${code} ${verb}` })
  }

  if (updatedById.size > 0) {
    const next = rows.map((row) => updatedById.get(Number(row.id)) ?? row)
    saveRows(FLOTATION_KEY, next)
  }

  if (action === COMPLETE_ACTION && accepted.length > 0) {
    appendLedger(
      accepted.map((item) => item.id),
      rows,
      updatedById,
    )
  }

  return {
    ok: rejected.length === 0 && setAside.length === 0,
    accepted,
    rejected,
    setAside,
    duplicates,
  }
}

function appendLedger(
  acceptedIds: number[],
  rows: EntryRow[],
  updatedById: Map<number, EntryRow>,
): void {
  const ledger = listLedger()
  let nextId = ledger.reduce((max, entry) => Math.max(max, entry.id), 0) + 1
  const today = new Date().toISOString().slice(0, 10)
  const additions: LedgerEntry[] = []
  for (const id of acceptedIds) {
    const row = updatedById.get(id) ?? rows.find((item) => Number(item.id) === id)
    if (!row) {
      continue
    }
    additions.push({
      id: nextId++,
      flotationId: id,
      样品编号: sampleCode(row),
      采样单位: String(row['采样单位'] ?? ''),
      样品重量: sampleWeight(row) ?? '',
      浮选日期: String(row['浮选日期'] ?? ''),
      炭化种子数: carbonizedSeedCount(row),
      送检去向: String(row['送检去向'] ?? ''),
      办结日期: today,
      超限: false,
    })
  }
  saveLedger([...ledger, ...additions])
}

// 列表页/明细页的单条动作入口，复用同一套批量校验口径。
export function runFlotationAction(id: number, action: string): ActionResult {
  const result = batchFlotationAction([id], action)
  const hit = [...result.accepted, ...result.rejected, ...result.setAside][0]
  if (hit) {
    return { ok: hit.outcome === 'accepted', message: hit.message }
  }
  return { ok: false, message: '没有处理任何浮选样品' }
}
