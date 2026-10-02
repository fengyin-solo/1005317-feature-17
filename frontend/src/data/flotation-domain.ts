import type { EntryRow } from './types'

// 浮选业务的口径统一收在这一处，列表页与明细页都读这里，避免两处各算各的。
export const FLOTATION_KEY = 'flotation'
export const SAMPLE_CODE_FIELD = '样品编号'

// 浮选状态只能逐级推进：待浮选 → 浮选中 → 已完成，走完已完成才允许废弃。
export const FLOTATION_STATUSES = ['待浮选', '浮选中', '已完成', '已废弃'] as const
export const FINAL_STATUS = '已废弃'

export const SUBMIT_ACTION = '提交浮选'
export const COMPLETE_ACTION = '确认完成'
export const DISCARD_ACTION = '登记废弃'

// 单样浮选重量上限（kg）：办结入台账时按此阈值拦截。
export const WEIGHT_LIMIT_KG = 20

// 样品编号统一口径：去掉首尾空白。列表、明细、批量去重都走这一份。
export function sampleCode(row: EntryRow): string {
  return String(row[SAMPLE_CODE_FIELD] ?? '').trim()
}

// 炭化种子数统一口径：取字段里的整数，取不到按 0 处理。
export function carbonizedSeedCount(row: EntryRow): number {
  const value = row['炭化种子数']
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  const parsed = Number.parseInt(String(value ?? '').replace(/[^0-9-]/g, ''), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

// 样品重量统一口径：解析成 kg 数值；字段缺失或解析不出时返回 null。
export function sampleWeight(row: EntryRow): number | null {
  const value = row['样品重量']
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  const text = String(value ?? '').trim()
  if (text === '') {
    return null
  }
  const parsed = Number.parseFloat(text.replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function isWeightMissing(row: EntryRow): boolean {
  return String(row['样品重量'] ?? '').trim() === '' || sampleWeight(row) === null
}

export function isDateMissing(row: EntryRow): boolean {
  return String(row['浮选日期'] ?? '').trim() === ''
}

// 动作与允许的当前状态：越权跳转一律拦下，只能逐级推进。
const ALLOWED_FROM: Record<string, string[]> = {
  [SUBMIT_ACTION]: ['待浮选'],
  [COMPLETE_ACTION]: ['浮选中'],
  [DISCARD_ACTION]: ['已完成'],
}

export type GuardResult = { ok: boolean; message: string }

export function guardTransition(row: EntryRow, action: string): GuardResult {
  const allowed = ALLOWED_FROM[action]
  const code = sampleCode(row)
  if (!allowed) {
    return { ok: false, message: `浮选样品没有登记「${action}」这个动作` }
  }
  const current = String(row.status)
  if (allowed.includes(current)) {
    return { ok: true, message: '' }
  }
  if (action === SUBMIT_ACTION && current === '已完成') {
    return { ok: false, message: `样品 ${code} 已完成浮选，不能再次提交浮选` }
  }
  if (action === SUBMIT_ACTION && current === '浮选中') {
    return { ok: false, message: `样品 ${code} 已在浮选中，不能重复提交` }
  }
  if (action === SUBMIT_ACTION && current === '已废弃') {
    return { ok: false, message: `样品 ${code} 已废弃，不能再提交浮选` }
  }
  if (action === COMPLETE_ACTION && current === '待浮选') {
    return { ok: false, message: `样品 ${code} 还在待浮选，需先提交浮选，不能直接确认完成` }
  }
  if (action === DISCARD_ACTION && current !== '已完成') {
    return { ok: false, message: `样品 ${code} 需走完待浮选、浮选中、已完成后才能废弃，当前为「${current}」` }
  }
  return { ok: false, message: `样品 ${code} 当前为「${current}」，不能执行「${action}」` }
}

// 目标状态与待办标记，终态已废弃才算办结之外的收口。
export function targetStatus(action: string): string {
  if (action === SUBMIT_ACTION) {
    return '浮选中'
  }
  if (action === COMPLETE_ACTION) {
    return '已完成'
  }
  if (action === DISCARD_ACTION) {
    return FINAL_STATUS
  }
  return ''
}
