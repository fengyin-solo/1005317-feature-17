import type { EntryRow } from '@/data/types'

/**
 * 浮选业务的统一口径：列表页与明细页都从这里取字段与规则，
 * 不在两个页面各写一份样品编号、各算一遍炭化种子数。
 */

export const FLOTATION_KEY = 'flotation'

export const FIELDS = {
  code: '样品编号',
  unit: '采样单位',
  weight: '样品重量',
  date: '浮选日期',
  residue: '炭屑含量',
  seeds: '炭化种子数',
  destination: '送检去向',
} as const

export const STATUSES = {
  pending: '待浮选',
  running: '浮选中',
  done: '已完成',
  abandoned: '已废弃',
} as const

/** 状态只能逐级推进：待浮选 → 浮选中 → 已完成 → 已废弃。 */
export const STATUS_FLOW = [
  STATUSES.pending,
  STATUSES.running,
  STATUSES.done,
  STATUSES.abandoned,
] as const

export const ACTIONS = {
  submit: '提交浮选',
  complete: '确认完成',
  abandon: '登记废弃',
} as const

/** 动作与目标状态的对应：每一步都只往下一级走。 */
export const ACTION_TARGET: Record<string, string> = {
  [ACTIONS.submit]: STATUSES.running,
  [ACTIONS.complete]: STATUSES.done,
  [ACTIONS.abandon]: STATUSES.abandoned,
}

/** 样品重量上限（千克），超出阈值的提交要拦下并单独标注。 */
export const WEIGHT_LIMIT_KG = 20

/** 同一份样品编号：列表页、明细页、送检台账都走这里读。 */
export function sampleCode(row: EntryRow): string {
  return String(row[FIELDS.code] ?? '').trim()
}

/** 样品重量解析为千克数值；解析不出来视为缺失。 */
export function parseWeight(row: EntryRow): number | null {
  const raw = row[FIELDS.weight]
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return null
  }
  const value = Number(String(raw).replace(/[^\d.]/g, ''))
  return Number.isFinite(value) ? value : null
}

/** 浮选日期口径：空串/占位文字都算缺日期。 */
export function flotationDate(row: EntryRow): string {
  const raw = row[FIELDS.date]
  if (raw === undefined || raw === null) {
    return ''
  }
  const value = String(raw).trim()
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value : ''
}

/** 炭化种子数的唯一口径：两处页面都调它，不再各算各的。 */
export function carbonSeedCount(row: EntryRow): number {
  const raw = row[FIELDS.seeds]
  if (raw === undefined || raw === null) {
    return 0
  }
  const value = Number(String(raw).replace(/[^\d]/g, ''))
  return Number.isFinite(value) ? value : 0
}

/** 提交浮选前的完整性校验：重量或浮选日期缺一件就挑出来。 */
export function missingFields(row: EntryRow): string[] {
  const missing: string[] = []
  if (parseWeight(row) === null) {
    missing.push(FIELDS.weight)
  }
  if (!flotationDate(row)) {
    missing.push(FIELDS.date)
  }
  return missing
}

/** 是否只能逐级推进：目标状态必须恰好是当前状态的下一级。 */
export function canTransition(from: string, action: string): boolean {
  const target = ACTION_TARGET[action]
  if (!target) {
    return false
  }
  const currentIndex = STATUS_FLOW.indexOf(from as (typeof STATUS_FLOW)[number])
  const targetIndex = STATUS_FLOW.indexOf(target as (typeof STATUS_FLOW)[number])
  return targetIndex === currentIndex + 1
}
