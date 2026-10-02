import { SEED_LEDGER } from './ledger-seed'
import { SEED_ROWS } from './seed'
import type { EntryRow, LedgerEntry } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'archaeology-field:entries'
const LEDGER_STORAGE_KEY = 'archaeology-field:flotation-ledger'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    return { ...fallback, ...parsed }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}

// 浮选办结台账：独立存放，避免和各业务模块的记录混在一份结构里。
let ledgerCache: LedgerEntry[] | null = null

function readLedger(): LedgerEntry[] {
  const fallback = clone(SEED_LEDGER)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(LEDGER_STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    return JSON.parse(raw) as LedgerEntry[]
  } catch {
    window.localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

export function listLedger(): LedgerEntry[] {
  if (ledgerCache === null) {
    ledgerCache = readLedger()
  }
  return ledgerCache
}

export function saveLedger(entries: LedgerEntry[]): void {
  ledgerCache = entries
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(entries))
  }
}

export function resetLedger(): LedgerEntry[] {
  const entries = clone(SEED_LEDGER)
  saveLedger(entries)
  return entries
}
