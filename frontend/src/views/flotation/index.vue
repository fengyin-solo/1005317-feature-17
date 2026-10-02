<template>
  <section class="page" data-module="flotation">
    <header class="page-head">
      <div>
        <h2>浮选样品管理</h2>
        <p class="page-desc">
          维护浮选样品，围绕样品编号、采样单位、样品重量、浮选日期做登记、筛选与状态流转；支持勾选多条批量投浮选。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="submitSelected" :disabled="selectedIds.length === 0">
          批量提交浮选（{{ selectedIds.length }}）
        </button>
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
      <span class="legend-item legend-warn">超限待处理：{{ overweightRows.length }}</span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>样品编号</span>
        <input v-model="filters['样品编号']" placeholder="按样品编号检索" />
      </label>
      <label class="filter-item">
        <span>采样单位</span>
        <input v-model="filters['采样单位']" placeholder="按采样单位检索" />
      </label>
      <label class="filter-item">
        <span>当前状态</span>
        <input v-model="filters['status']" placeholder="按当前状态检索" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
      <RouterLink class="btn ghost" to="/flotation/ledger">查看送检台账</RouterLink>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th class="col-check">
            <input
              type="checkbox"
              :checked="allVisibleSelected"
              :indeterminate.prop="someVisibleSelected"
              @change="toggleAll"
            />
          </th>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>标记</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)" :class="{ 'row-overweight': isOverweight(row) }">
          <td class="col-check">
            <input type="checkbox" :value="Number(row.id)" v-model="selectedIds" />
          </td>
          <td>
            <RouterLink class="link" :to="`/flotation/${row.id}`">{{ sampleCode(row) }}</RouterLink>
          </td>
          <td>{{ row['采样单位'] ?? '—' }}</td>
          <td>{{ row['样品重量'] === '' || row['样品重量'] == null ? '—' : row['样品重量'] }}</td>
          <td>{{ row['浮选日期'] || '—' }}</td>
          <td>{{ row['炭屑含量'] || '—' }}</td>
          <td>{{ carbonizedSeedCount(row) }}</td>
          <td>{{ row['送检去向'] || '—' }}</td>
          <td>{{ row['样品状态'] || '—' }}</td>
          <td>{{ row.status }}</td>
          <td>
            <span v-if="isOverweight(row)" class="tag tag-warn">超重量上限</span>
            <span v-else-if="missingFields(row).length" class="tag tag-muted">
              缺{{ missingFields(row).join('、') }}
            </span>
            <span v-else>—</span>
          </td>
          <td class="row-actions">
            <button
              v-for="action in availableActions(row)"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
            <span v-if="availableActions(row).length === 0" class="text-muted">—</span>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 4" class="empty-state">暂无浮选样品数据</td>
        </tr>
      </tbody>
    </table>

    <section v-if="batchResult" class="batch-panel">
      <h3>本批处理结果</h3>
      <p class="batch-summary">
        成功 {{ batchResult.accepted.length }} 条 · 挑出待补 {{ batchResult.setAside.length }} 条 ·
        拦截 {{ batchResult.rejected.length }} 条（含重复编号 {{ batchResult.duplicates.length }} 条）
      </p>
      <ul v-if="batchResult.accepted.length" class="result-list result-ok">
        <li v-for="item in batchResult.accepted" :key="`ok-${item.id}`">{{ item.message }}</li>
      </ul>
      <ul v-if="batchResult.setAside.length" class="result-list result-aside">
        <li v-for="item in batchResult.setAside" :key="`aside-${item.id}`">{{ item.message }}</li>
      </ul>
      <ul v-if="batchResult.rejected.length" class="result-list result-bad">
        <li v-for="item in batchResult.rejected" :key="`bad-${item.id}`">{{ item.message }}</li>
      </ul>
    </section>

    <footer class="page-foot">
      <span>共 {{ total }} 条浮选样品记录 · 单样重量上限 {{ WEIGHT_LIMIT_KG }}kg</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { batchFlotationAction, runFlotationAction } from '@/api/flotation-service'
import { downloadEntries, filterRows, listEntries } from '@/api/local-service'
import {
  carbonizedSeedCount,
  COMPLETE_ACTION,
  DISCARD_ACTION,
  FLOTATION_KEY,
  isDateMissing,
  isWeightMissing,
  sampleCode,
  sampleWeight,
  SUBMIT_ACTION,
  WEIGHT_LIMIT_KG,
} from '@/data/flotation-domain'
import type { BatchResult, EntryRow } from '@/data/types'

const columns = ['样品编号', '采样单位', '样品重量', '浮选日期', '炭屑含量', '炭化种子数', '送检去向', '样品状态']

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const selectedIds = ref<number[]>([])
const batchResult = ref<BatchResult | null>(null)

const statusSummary = computed(() =>
  ['待浮选', '浮选中', '已完成', '已废弃'].map((status) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const overweightRows = computed(() => rows.value.filter((row) => isOverweight(row)))

const stats = computed(() => [
  { label: '待浮选样品', value: countByStatus('待浮选') },
  { label: '浮选中样品', value: countByStatus('浮选中') },
  { label: '已出结果样品', value: countByStatus('已完成') },
  { label: '超限待处理', value: overweightRows.value.length },
])

const visibleIds = computed(() => rows.value.map((row) => Number(row.id)))
const allVisibleSelected = computed(
  () => visibleIds.value.length > 0 && visibleIds.value.every((id) => selectedIds.value.includes(id)),
)
const someVisibleSelected = computed(
  () => !allVisibleSelected.value && visibleIds.value.some((id) => selectedIds.value.includes(id)),
)

function countByStatus(status: string): number {
  return rows.value.filter((row) => String(row.status) === status).length
}

function isOverweight(row: EntryRow): boolean {
  if (row['超限'] === true) {
    return true
  }
  const weight = sampleWeight(row)
  return weight !== null && weight > WEIGHT_LIMIT_KG
}

function missingFields(row: EntryRow): string[] {
  const lack: string[] = []
  if (isWeightMissing(row)) {
    lack.push('重量')
  }
  if (isDateMissing(row)) {
    lack.push('浮选日期')
  }
  return lack
}

// 浮选只能逐级推进：按当前状态只给出合法的下一步动作。
function availableActions(row: EntryRow): string[] {
  switch (String(row.status)) {
    case '待浮选':
      return [SUBMIT_ACTION]
    case '浮选中':
      return [COMPLETE_ACTION]
    case '已完成':
      return [DISCARD_ACTION]
    default:
      return []
  }
}

function toggleAll(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  const visible = new Set(visibleIds.value)
  if (checked) {
    selectedIds.value = Array.from(new Set([...selectedIds.value, ...visible]))
  } else {
    selectedIds.value = selectedIds.value.filter((id) => !visible.has(id))
  }
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(FLOTATION_KEY)
}

function submitSelected() {
  errorMessage.value = ''
  batchResult.value = batchFlotationAction(selectedIds.value, SUBMIT_ACTION)
  selectedIds.value = []
  reload()
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  batchResult.value = null
  const result = runFlotationAction(Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    // 状态是框架字段，筛选时单独拎出来，其余按字段口径走通用过滤。
    const { status, ...fieldFilters } = filters.value
    let matched = filterRows(listEntries(FLOTATION_KEY).items, fieldFilters)
    if (status && status.trim() !== '') {
      matched = matched.filter((row) => String(row.status).includes(status.trim()))
    }
    rows.value = matched
    total.value = matched.length
    selectedIds.value = selectedIds.value.filter((id) => matched.some((row) => Number(row.id) === id))
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '浮选样品列表读取失败'
  }
}

onMounted(reload)
</script>

<style scoped>
.col-check {
  width: 36px;
  text-align: center;
}
.row-overweight {
  background: #fff7ed;
}
.tag {
  display: inline-block;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 12px;
  white-space: nowrap;
}
.tag-warn {
  background: #fee4e2;
  color: #b42318;
}
.tag-muted {
  background: #eef2f7;
  color: #64748b;
}
.text-muted {
  color: #94a3b8;
}
.legend-warn {
  background: #fee4e2;
  color: #b42318;
}
.batch-panel {
  margin-top: 14px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
}
.batch-panel h3 {
  margin: 0 0 6px;
  font-size: 14px;
}
.batch-summary {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--muted);
}
.result-list {
  margin: 4px 0;
  padding-left: 18px;
  font-size: 13px;
}
.result-ok li {
  color: #067647;
}
.result-aside li {
  color: #b54708;
}
.result-bad li {
  color: #b42318;
}
</style>
