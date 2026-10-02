import type { LedgerRow } from './types'

// 送检台账独立存放：浮选办结（确认完成）的结果逐条落进这里。
const LEDGER_KEY = 'archaeology-field:flotation-ledger'

type LedgerDraft = Omit<LedgerRow, 'id' | 'ledgerNo'>

function formatNo(seq: number): string {
  return `LED-${String(seq).padStart(4, '0')}`
}

function readStorage(): LedgerRow[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return []
  }
  const raw = window.localStorage.getItem(LEDGER_KEY)
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as LedgerRow[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

let cache: LedgerRow[] | null = null

export function listLedger(): LedgerRow[] {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function hasLedgerEntry(sampleCode: string): boolean {
  return listLedger().some((row) => row.sampleCode === sampleCode)
}

/** 同一样品编号只落一条台账，重复办结不重复记；返回本次实际新增的行。 */
export function appendLedgerEntries(drafts: LedgerDraft[]): LedgerRow[] {
  const existing = listLedger()
  const known = new Set(existing.map((row) => row.sampleCode))
  let nextId = existing.reduce((max, row) => Math.max(max, row.id), 0)
  const additions = drafts
    .filter((row) => !known.has(row.sampleCode))
    .map((row) => {
      nextId += 1
      return { ...row, id: nextId, ledgerNo: formatNo(nextId) } satisfies LedgerRow
    })
  const next = [...existing, ...additions]
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(next))
  }
  return additions
}
