<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>送检台账</h2>
        <p class="page-desc">
          浮选样品办结（确认完成）后的结果逐条落进本台账，同一样品编号只登记一次；可按样品编号或送检去向检索。
        </p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" :to="{ name: 'flotation' }">返回浮选样品</RouterLink>
        <button class="btn" type="button" @click="exportLedger">导出台账 CSV</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">台账条目</span>
        <strong class="stat-value">{{ rows.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">炭化种子累计</span>
        <strong class="stat-value">{{ totalSeeds }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">本月办结送检</span>
        <strong class="stat-value">{{ currentMonthCount }}</strong>
      </article>
    </div>

    <form class="filter-bar" @submit.prevent>
      <label class="filter-item">
        <span>样品编号</span>
        <input v-model="keyword" placeholder="按样品编号检索" />
      </label>
      <label class="filter-item">
        <span>送检去向</span>
        <input v-model="destination" placeholder="按送检去向检索" />
      </label>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>台账编号</th>
          <th>样品编号</th>
          <th>采样单位</th>
          <th>样品重量(kg)</th>
          <th>浮选日期</th>
          <th>炭化种子数</th>
          <th>送检去向</th>
          <th>办结归档日</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in pageRows" :key="row.id">
          <td>{{ row.ledgerNo }}</td>
          <td>
            <RouterLink class="link" :to="{ name: 'flotation-detail', params: { id: sampleRowId(row.sampleCode) } }">
              {{ row.sampleCode }}
            </RouterLink>
          </td>
          <td>{{ row.samplingUnit || '—' }}</td>
          <td>{{ row.sampleWeight ?? '—' }}</td>
          <td>{{ row.flotationDate || '—' }}</td>
          <td>{{ row.carbonSeeds }}</td>
          <td>{{ row.destination || '—' }}</td>
          <td>{{ row.archivedAt }}</td>
        </tr>
        <tr v-if="!pageRows.length">
          <td colspan="8" class="empty-state">暂无送检台账记录，浮选样品确认完成后自动落入</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ pageRows.length }} 条送检台账记录</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { listLedger } from '@/data/ledger-store'
import { listRows } from '@/data/local-store'
import { FIELDS } from '@/data/flotation'
import type { LedgerRow } from '@/data/types'

const keyword = ref('')
const destination = ref('')

// 路由切回本页时组件重新挂载，computed 重新读取台账缓存。
const rows = computed<LedgerRow[]>(() => listLedger())

const pageRows = computed(() =>
  rows.value.filter((row) => {
    const matchCode = row.sampleCode.includes(keyword.value.trim())
    const matchDestination =
      destination.value.trim() === '' || row.destination.includes(destination.value.trim())
    return matchCode && matchDestination
  }),
)

const totalSeeds = computed(() => rows.value.reduce((sum, row) => sum + row.carbonSeeds, 0))

const currentMonthCount = computed(() => {
  const month = new Date().toISOString().slice(0, 7)
  return rows.value.filter((row) => row.archivedAt.startsWith(month)).length
})

function sampleRowId(code: string): number {
  // 台账里样品编号对应的浮选记录：列表/明细共用同一份样品编号。
  const hit = listRows('flotation').find((row) => String(row[FIELDS.code] ?? '').trim() === code)
  return hit ? Number(hit.id) : 0
}

function exportLedger() {
  const header = ['台账编号', '样品编号', '采样单位', '样品重量(kg)', '浮选日期', '炭化种子数', '送检去向', '办结归档日']
  const lines = [header.join(',')]
  for (const row of pageRows.value) {
    lines.push(
      [
        row.ledgerNo,
        row.sampleCode,
        row.samplingUnit,
        row.sampleWeight ?? '',
        row.flotationDate,
        row.carbonSeeds,
        row.destination,
        row.archivedAt,
      ].join(','),
    )
  }
  const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = '送检台账.csv'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
</script>
