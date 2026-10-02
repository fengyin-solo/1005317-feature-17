<template>
  <section v-if="result" class="batch-result">
    <header class="result-head">
      <strong :class="result.ok ? 'ok-text' : 'error-text'">{{ result.message }}</strong>
      <button class="btn ghost btn-sm" type="button" @click="emit('close')">收起</button>
    </header>
    <div class="result-summary">
      <span class="chip chip-success">成功 {{ result.successCount }} 条</span>
      <span v-if="duplicateCount" class="chip chip-duplicate">重复编号 {{ duplicateCount }} 条</span>
      <span v-if="missingCount" class="chip chip-missing">资料不全 {{ missingCount }} 条</span>
      <span v-if="result.overweightItems.length" class="chip chip-overweight">
        重量超限 {{ result.overweightItems.length }} 条
      </span>
      <span v-if="blockedCount" class="chip chip-blocked">状态拦下 {{ blockedCount }} 条</span>
    </div>
    <table class="data-table result-table">
      <thead>
        <tr>
          <th>样品编号</th>
          <th>处理结果</th>
          <th>当前状态</th>
          <th>原因说明</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in result.items" :key="item.id" :class="rowClass(item.kind)">
          <td>{{ item.code }}</td>
          <td><span class="chip" :class="chipClass(item.kind)">{{ labelOf(item.kind) }}</span></td>
          <td>{{ item.status }}</td>
          <td>{{ item.reason }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="result.overweightItems.length" class="overweight-note">
      被重量上限拦下的 {{ result.overweightItems.length }} 件已在列表中单独标注「超限」标签：
      {{ result.overweightItems.map((item) => item.code).join('、') }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import type { BatchActionResult, BatchItemOutcome } from '@/data/types'

const props = defineProps<{ result: BatchActionResult | null }>()
const emit = defineEmits<{ close: [] }>()

function countOf(kind: BatchItemOutcome['kind']): number {
  return props.result ? props.result.items.filter((item) => item.kind === kind).length : 0
}

const duplicateCount = computed(() => countOf('duplicate'))
const missingCount = computed(() => countOf('missing'))
const blockedCount = computed(() => countOf('blocked'))

function labelOf(kind: BatchItemOutcome['kind']): string {
  switch (kind) {
    case 'success':
      return '成功'
    case 'duplicate':
      return '重复编号'
    case 'missing':
      return '资料不全'
    case 'overweight':
      return '重量超限'
    case 'blocked':
      return '拦下'
  }
}

function chipClass(kind: BatchItemOutcome['kind']): string {
  return `chip-${kind}`
}

function rowClass(kind: BatchItemOutcome['kind']): string {
  return kind === 'success' ? '' : `row-${kind}`
}
</script>

<style scoped>
.batch-result {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  margin: 12px 0;
}
.result-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.result-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.btn-sm {
  padding: 2px 10px;
  font-size: 12px;
}
.chip {
  display: inline-block;
  border-radius: 999px;
  padding: 1px 10px;
  font-size: 12px;
  background: #eef2f7;
  color: #334155;
}
.chip-success {
  background: #e7f6ec;
  color: #15803d;
}
.chip-duplicate {
  background: #eef2ff;
  color: #4338ca;
}
.chip-missing {
  background: #fff4e5;
  color: #b45309;
}
.chip-overweight {
  background: #fdeaea;
  color: #b42318;
}
.chip-blocked {
  background: #f1f5f9;
  color: #475569;
}
.result-table {
  margin-top: 4px;
}
.row-duplicate td,
.row-blocked td {
  background: #f8fafc;
}
.row-missing td {
  background: #fffaf3;
}
.row-overweight td {
  background: #fef2f2;
}
.overweight-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: #b42318;
}
.ok-text {
  color: #15803d;
}
</style>
