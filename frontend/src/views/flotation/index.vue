<template>
  <section class="page" data-module="flotation">
    <header class="page-head">
      <div>
        <h2>浮选样品管理</h2>
        <p class="page-desc">
          浮选样品成批来时可勾选多条一并投浮选，逐条返回处理结果；缺重量/浮选日期、超重量上限的样品单独拦下不挡整批。
        </p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" :to="{ name: 'flotation-ledger' }">查看送检台账</RouterLink>
        <button class="btn" type="button" @click="exportRows">导出浮选样品清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>样品编号</span>
        <input v-model="filters.code" placeholder="按样品编号检索" />
      </label>
      <label class="filter-item">
        <span>采样单位</span>
        <input v-model="filters.unit" placeholder="按采样单位检索" />
      </label>
      <label class="filter-item">
        <span>样品状态</span>
        <select v-model="filters.status">
          <option value="">全部状态</option>
          <option v-for="status in statuses" :key="status" :value="status">{{ status }}</option>
        </select>
      </label>
      <label class="filter-check">
        <input v-model="onlyOverweight" type="checkbox" />
        <span>只看重量超限标注</span>
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <div class="batch-bar">
      <label class="select-all">
        <input
          :checked="allVisibleSelected"
          :indeterminate="someVisibleSelected"
          type="checkbox"
          @change="toggleSelectAll"
        />
        全选本页
      </label>
      <span class="select-count">已勾选 {{ selectedIds.length }} 条</span>
      <button
        v-for="action in actions"
        :key="action"
        class="btn"
        :class="{ primary: action === '提交浮选' }"
        :disabled="!selectedIds.length"
        type="button"
        @click="runBatch(action)"
      >
        批量{{ action }}（{{ selectedIds.length }}）
      </button>
    </div>

    <BatchResult :result="batchResult" @close="batchResult = null" />

    <table class="data-table">
      <thead>
        <tr>
          <th class="col-check">勾选</th>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>超限标注</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in pageRows" :key="String(row.id)" :class="{ 'row-flagged': overweightFlag(row) }">
          <td class="col-check">
            <input v-model="selected" :value="Number(row.id)" type="checkbox" />
          </td>
          <td>
            <RouterLink class="link" :to="{ name: 'flotation-detail', params: { id: row.id } }">
              {{ codeOf(row) || '—' }}
            </RouterLink>
          </td>
          <td>{{ row[FIELDS.unit] || '—' }}</td>
          <td>
            <span :class="{ 'lack-text': weightOf(row) === null }">
              {{ weightOf(row) === null ? '缺' : `${weightOf(row)} kg` }}
            </span>
          </td>
          <td>
            <span :class="{ 'lack-text': !dateOf(row) }">{{ dateOf(row) || '缺' }}</span>
          </td>
          <td>{{ row[FIELDS.residue] || '—' }}</td>
          <td>{{ seedCountOf(row) }}</td>
          <td>{{ row[FIELDS.destination] || '—' }}</td>
          <td>
            <span class="status-tag" :class="`status-${String(row.status)}`">{{ row.status }}</span>
          </td>
          <td>
            <span v-if="overweightFlag(row)" class="chip chip-overweight">{{ overweightFlag(row) }}</span>
            <span v-else>—</span>
          </td>
          <td class="row-actions">
            <button
              v-for="action in actionsFor(row)"
              :key="action"
              class="link"
              type="button"
              @click="runSingle(action, row)"
            >
              {{ action }}
            </button>
            <span v-if="!actionsFor(row).length" class="muted-text">无</span>
          </td>
        </tr>
        <tr v-if="!pageRows.length">
          <td :colspan="columns.length + 3" class="empty-state">没有符合条件的浮选样品</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条浮选样品记录 · 重量上限 {{ WEIGHT_LIMIT_KG }} kg，超限件整件拦下并标注</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { downloadEntries, listEntries } from '@/api/local-service'
import { overweightFlag, runFlotationBatch } from '@/api/flotation-service'
import BatchResult from '@/views/flotation/BatchResult.vue'
import {
  ACTIONS,
  canTransition,
  carbonSeedCount,
  FIELDS,
  flotationDate,
  parseWeight,
  sampleCode,
  STATUSES,
  STATUS_FLOW,
  WEIGHT_LIMIT_KG,
} from '@/data/flotation'
import type { BatchActionResult, EntryRow } from '@/data/types'

const columns = ['样品编号', '采样单位', '样品重量', '浮选日期', '炭屑含量', '炭化种子数', '送检去向']
const actions = [ACTIONS.submit, ACTIONS.complete, ACTIONS.abandon]
const statuses = [...STATUS_FLOW]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const batchResult = ref<BatchActionResult | null>(null)
const selected = ref<number[]>([])
const onlyOverweight = ref(false)
const filters = ref({ code: '', unit: '', status: '' })

// 样品编号、重量、日期、炭化种子数全部走统一口径，列表页不再各算各的。
const codeOf = sampleCode
const weightOf = parseWeight
const dateOf = flotationDate
const seedCountOf = carbonSeedCount

const pageRows = computed(() => {
  return rows.value.filter((row) => !onlyOverweight.value || overweightFlag(row) !== '')
})

const selectedIds = computed(() => selected.value)

const allVisibleSelected = computed(
  () => pageRows.value.length > 0 && pageRows.value.every((row) => selected.value.includes(Number(row.id))),
)
const someVisibleSelected = computed(
  () => !allVisibleSelected.value && pageRows.value.some((row) => selected.value.includes(Number(row.id))),
)

const stats = computed(() => [
  { label: '待浮选样品', value: rows.value.filter((row) => row.status === STATUSES.pending).length },
  { label: '浮选中样品', value: rows.value.filter((row) => row.status === STATUSES.running).length },
  { label: '已办结样品', value: rows.value.filter((row) => row.status === STATUSES.done).length },
  { label: '重量超限标注', value: rows.value.filter((row) => overweightFlag(row) !== '').length },
])

const statusSummary = computed(() =>
  statuses.map((status) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function toggleSelectAll(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  const visibleIds = pageRows.value.map((row) => Number(row.id))
  if (checked) {
    selected.value = Array.from(new Set([...selected.value, ...visibleIds]))
  } else {
    const visibleSet = new Set(visibleIds)
    selected.value = selected.value.filter((id) => !visibleSet.has(id))
  }
}

function actionsFor(row: EntryRow): string[] {
  return actions.filter((action) => canTransition(String(row.status), action))
}

function resetFilters() {
  filters.value = { code: '', unit: '', status: '' }
  onlyOverweight.value = false
  reload()
}

function exportRows() {
  downloadEntries('flotation')
}

function runBatch(action: string) {
  if (!selected.value.length) {
    return
  }
  batchResult.value = runFlotationBatch([...selected.value], action)
  selected.value = []
  reload()
}

function runSingle(action: string, row: EntryRow) {
  batchResult.value = runFlotationBatch([Number(row.id)], action)
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries('flotation', {
      [FIELDS.code]: filters.value.code,
      [FIELDS.unit]: filters.value.unit,
      status: filters.value.status,
    })
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '浮选样品列表读取失败'
  }
}

onMounted(reload)
</script>

<style scoped>
.batch-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
}
.select-all,
.filter-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.select-count {
  font-size: 12px;
  color: var(--muted);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.col-check {
  width: 40px;
  text-align: center;
}
.lack-text {
  color: #b45309;
  font-weight: 600;
}
.muted-text {
  color: var(--muted);
}
.row-flagged {
  background: #fef2f2;
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
