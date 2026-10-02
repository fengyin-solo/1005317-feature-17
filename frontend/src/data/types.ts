/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

// 批量动作里单条样品的处理结论：整批不互相挡住，逐条交代去向。
export type ItemResult = {
  id: number
  code: string
  outcome: 'accepted' | 'rejected' | 'set-aside'
  message: string
}

export type BatchResult = {
  ok: boolean
  accepted: ItemResult[]
  rejected: ItemResult[]
  setAside: ItemResult[]
  duplicates: ItemResult[]
}

// 浮选办结（确认完成）后落到送检台账的记录。
export type LedgerEntry = {
  id: number
  flotationId: number
  样品编号: string
  采样单位: string
  样品重量: number | string
  浮选日期: string
  炭化种子数: number
  送检去向: string
  办结日期: string
  超限: boolean
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
