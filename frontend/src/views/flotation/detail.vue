<template>
  <section class="page detail-page">
    <header class="page-head">
      <div>
        <h2>浮选样品明细</h2>
        <p class="page-desc">
          明细页与列表页读同一份样品编号、同一套炭化种子数口径；在本页执行动作同样遵守逐级推进与重量阈值。
        </p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" :to="{ name: 'flotation' }">返回列表</RouterLink>
      </div>
    </header>

    <article v-if="row" class="detail-card">
      <div class="detail-title">
        <h3>{{ codeOf(row) }}</h3>
        <span class="status-tag" :class="`status-${row.status}`">{{ row.status }}</span>
        <span v-if="overweightFlag(row)" class="chip chip-overweight">{{ overweightFlag(row) }}</span>
      </div>

      <dl class="detail-grid">
        <div v-for="field in metaFields" :key="field" class="detail-item">
          <dt>{{ field }}</dt>
          <dd :class="{ 'lack-text': isLacking(field, row) }">{{ displayValue(field, row) }}</dd>
        </div>
        <div class="detail-item">
          <dt>当前状态</dt>
          <dd>{{ row.status }}</dd>
        </div>
        <div class="detail-item">
          <dt>送检台账</dt>
          <dd>
            <RouterLink v-if="inLedger" class="link" :to="{ name: 'flotation-ledger' }">已落入送检台账</RouterLink>
            <span v-else class="muted-text">尚未办结，办结后自动落入台账</span>
          </dd>
        </div>
      </dl>

      <div class="detail-checks">
        <h4>提交浮选前检查</h4>
        <ul>
          <li :class="weightOf(row) === null ? 'check-bad' : 'check-ok'">
            样品重量：{{ weightOf(row) === null ? '缺失，需要先补登' : `${weightOf(row)} kg（上限 ${WEIGHT_LIMIT_KG} kg）` }}
          </li>
          <li :class="weightOf(row) !== null && weightOf(row)! > WEIGHT_LIMIT_KG ? 'check-bad' : 'check-ok'">
            重量阈值：
            <template v-if="weightOf(row) === null">待补登重量后判定</template>
            <template v-else-if="weightOf(row)! > WEIGHT_LIMIT_KG">超上限，按阈值拦下</template>
            <template v-else>未超限，可以投入</template>
          </li>
          <li :class="!dateOf(row) ? 'check-bad' : 'check-ok'">
            浮选日期：{{ dateOf(row) || '缺失，需要先补登' }}
          </li>
        </ul>
      </div>

      <div class="detail-actions">
        <button
          v-for="action in availableActions"
          :key="action"
          class="btn"
          :class="{ primary: action === ACTIONS.submit }"
          type="button"
          @click="runSingle(action)"
        >
          {{ action }}
        </button>
        <span v-if="!availableActions.length" class="muted-text">当前状态「{{ row.status }}」已无后续可执行动作</span>
      </div>
    </article>

    <article v-else class="detail-card empty-state">
      没有找到编号为 {{ route.params.id }} 的浮选样品
    </article>

    <BatchResult :result="batchResult" @close="batchResult = null" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { overweightFlag, runFlotationBatch } from '@/api/flotation-service'
import { listRows } from '@/data/local-store'
import { hasLedgerEntry } from '@/data/ledger-store'
import BatchResult from '@/views/flotation/BatchResult.vue'
import {
  ACTIONS,
  canTransition,
  carbonSeedCount,
  FIELDS,
  flotationDate,
  parseWeight,
  sampleCode,
  STATUS_FLOW,
  WEIGHT_LIMIT_KG,
} from '@/data/flotation'
import type { BatchActionResult, EntryRow } from '@/data/types'

const route = useRoute()

// 与列表页完全一致的统一口径：同一样品编号、同一份炭化种子数算法。
const codeOf = sampleCode
const weightOf = parseWeight
const dateOf = flotationDate
const seedCountOf = carbonSeedCount

const metaFields = [
  FIELDS.code,
  FIELDS.unit,
  FIELDS.weight,
  FIELDS.date,
  FIELDS.residue,
  FIELDS.seeds,
  FIELDS.destination,
]

const row = ref<EntryRow | null>(null)
const batchResult = ref<BatchActionResult | null>(null)

const availableActions = computed(() =>
  row.value
    ? [ACTIONS.submit, ACTIONS.complete, ACTIONS.abandon].filter((action) =>
        canTransition(String(row.value?.status), action),
      )
    : [],
)

const inLedger = computed(() => (row.value ? hasLedgerEntry(codeOf(row.value)) : false))

function isLacking(field: string, current: EntryRow): boolean {
  if (field === FIELDS.weight) {
    return weightOf(current) === null
  }
  if (field === FIELDS.date) {
    return !dateOf(current)
  }
  return false
}

function displayValue(field: string, current: EntryRow): string {
  if (field === FIELDS.weight) {
    const value = weightOf(current)
    return value === null ? '缺失' : `${value} kg`
  }
  if (field === FIELDS.date) {
    return dateOf(current) || '缺失'
  }
  if (field === FIELDS.seeds) {
    return String(seedCountOf(current))
  }
  const value = current[field]
  return value === undefined || value === '' ? '—' : String(value)
}

function runSingle(action: string) {
  if (!row.value) {
    return
  }
  batchResult.value = runFlotationBatch([Number(row.value.id)], action)
  load()
}

function load() {
  const id = Number(route.params.id)
  row.value = listRows('flotation').find((item) => Number(item.id) === id) ?? null
}

watch(() => route.params.id, load)
onMounted(load)
</script>

<style scoped>
.detail-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  margin-top: 12px;
}
.detail-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.detail-title h3 {
  margin: 0;
}
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 24px;
  margin: 12px 0;
}
.detail-item dt {
  font-size: 12px;
  color: var(--muted);
}
.detail-item dd {
  margin: 2px 0 0;
  font-size: 14px;
}
.lack-text {
  color: #b45309;
  font-weight: 600;
}
.muted-text {
  color: var(--muted);
}
.detail-checks {
  border-top: 1px dashed var(--border);
  padding-top: 10px;
}
.detail-checks h4 {
  margin: 0 0 6px;
}
.detail-checks ul {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
}
.check-ok {
  color: #15803d;
}
.check-bad {
  color: #b42318;
}
.detail-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}
.chip {
  display: inline-block;
  border-radius: 999px;
  padding: 1px 10px;
  font-size: 12px;
}
.chip-overweight {
  background: #fdeaea;
  color: #b42318;
}
.status-tag {
  display: inline-block;
  border-radius: 4px;
  padding: 1px 8px;
  font-size: 12px;
  background: #eef2f7;
}
.status-已完成 {
  background: #e7f6ec;
  color: #15803d;
}
.status-已废弃 {
  background: #f1f5f9;
  color: #64748b;
}
</style>
