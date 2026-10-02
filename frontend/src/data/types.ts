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

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

/** 批量动作里单条样品的处理结论。 */
export type BatchItemOutcome = {
  id: number
  code: string
  ok: boolean
  /** 该条最终落到的状态（成功时）或原状态（被拦下时）。 */
  status: string
  /** 跳过/拦截/成功的原因，页面逐条展示。 */
  reason: string
  kind: 'success' | 'duplicate' | 'missing' | 'overweight' | 'blocked'
}

export type BatchActionResult = {
  /** 整批是否有至少一条成功：缺字段、超限的不挡整批。 */
  ok: boolean
  message: string
  action: string
  items: BatchItemOutcome[]
  successCount: number
  skipCount: number
  /** 被重量阈值拦下的那几件，单独拎出来标注。 */
  overweightItems: BatchItemOutcome[]
}

/** 送检台账：浮选办结（确认完成）后落入的台账行。 */
export type LedgerRow = {
  id: number
  ledgerNo: string
  sampleCode: string
  samplingUnit: string
  sampleWeight: number | null
  flotationDate: string
  carbonSeeds: number
  destination: string
  archivedAt: string
}
