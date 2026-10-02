<template>
  <section class="page" data-module="flotation-ledger">
    <header class="page-head">
      <div>
        <h2>浮选送检台账</h2>
        <p class="page-desc">
          浮选办结（确认完成）的结果落到这里；重量超过 {{ WEIGHT_LIMIT_KG }}kg 上限的样品会被拦下、不入账，并单独标注。
        </p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn ghost" to="/flotation">返回浮选列表</RouterLink>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">已办结入账</span>
        <strong class="stat-value">{{ entries.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">炭化种子合计（统一口径）</span>
        <strong class="stat-value">{{ totalSeeds }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">超限拦截件（在浮选列表标注）</span>
        <strong class="stat-value">{{ overweightSamples.length }}</strong>
      </article>
    </div>

    <h3 class="block-title">台账记录</h3>
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
          <th>办结日期</th>
          <th>超限</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in entries" :key="entry.id">
          <td>{{ entry.id }}</td>
          <td>{{ entry.样品编号 }}</td>
          <td>{{ entry.采样单位 }}</td>
          <td>{{ entry.样品重量 }}</td>
          <td>{{ entry.浮选日期 }}</td>
          <td>{{ entry.炭化种子数 }}</td>
          <td>{{ entry.送检去向 }}</td>
          <td>{{ entry.办结日期 }}</td>
          <td>
            <span :class="entry.超限 ? 'tag tag-warn' : 'tag tag-ok'">
              {{ entry.超限 ? '超限' : '正常' }}
            </span>
          </td>
        </tr>
        <tr v-if="!entries.length">
          <td colspan="9" class="empty-state">台账暂无办结记录</td>
        </tr>
      </tbody>
    </table>

    <section v-if="overweightSamples.length" class="overweight-block">
      <h3 class="block-title">超限拦截件（需单独处理，未入台账）</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>样品编号</th>
            <th>采样单位</th>
            <th>样品重量(kg)</th>
            <th>当前状态</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in overweightSamples" :key="Number(row.id)" class="row-overweight">
            <td>{{ sampleCode(row) }}</td>
            <td>{{ row['采样单位'] }}</td>
            <td>{{ sampleWeight(row) }}</td>
            <td>{{ row.status }}</td>
            <td class="bad-text">
              超出单样上限 {{ WEIGHT_LIMIT_KG }}kg，已拦截办结、单独标注
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { ledgerEntries } from '@/api/local-service'
import { sampleCode, sampleWeight, WEIGHT_LIMIT_KG } from '@/data/flotation-domain'
import { listRows } from '@/data/local-store'

const entries = ref(ledgerEntries())

// 台账页刷新时重新取数（从明细页办结返回也能反映最新结果）。
function refresh() {
  entries.value = ledgerEntries()
}
refresh()

const totalSeeds = computed(() =>
  entries.value.reduce((sum, entry) => sum + Number(entry.炭化种子数 || 0), 0),
)

// 浮选数据里被阈值拦下并标注了超限的样品，单独列出提醒处理。
const overweightSamples = computed(() =>
  listRows('flotation').filter((row) => {
    if (row['超限'] === true) {
      return true
    }
    const weight = sampleWeight(row)
    return weight !== null && weight > WEIGHT_LIMIT_KG
  }),
)
</script>

<style scoped>
.block-title {
  font-size: 14px;
  margin: 16px 0 8px;
}
.tag {
  display: inline-block;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 12px;
}
.tag-ok {
  background: #e7f6ec;
  color: #067647;
}
.tag-warn {
  background: #fee4e2;
  color: #b42318;
}
.row-overweight {
  background: #fff7ed;
}
.bad-text {
  color: #b42318;
}
.overweight-block {
  margin-top: 18px;
}
</style>
