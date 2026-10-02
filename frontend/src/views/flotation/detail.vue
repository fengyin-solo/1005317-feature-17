<template>
  <section class="page" data-module="flotation-detail">
    <header class="page-head">
      <div>
        <h2>浮选样品明细</h2>
        <p class="page-desc">与列表页读取同一份样品编号与炭化种子数口径，状态只能逐级推进。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn ghost" to="/flotation">返回浮选列表</RouterLink>
      </div>
    </header>

    <article v-if="row" class="detail-card">
      <div class="detail-head">
        <h3>{{ code }}</h3>
        <span class="tag" :class="statusClass">{{ row.status }}</span>
        <span v-if="isOverweight" class="tag tag-warn">超重量上限（{{ WEIGHT_LIMIT_KG }}kg）</span>
      </div>

      <dl class="detail-grid">
        <div v-for="item in fields" :key="item.label" class="detail-item">
          <dt>{{ item.label }}</dt>
          <dd>{{ item.value }}</dd>
        </div>
        <div class="detail-item">
          <dt>炭化种子数（统一口径）</dt>
          <dd>{{ seedCount }} 粒</dd>
        </div>
      </dl>

      <div v-if="missing.length" class="notice notice-warn">
        该样品缺 {{ missing.join('、') }}，提交浮选前需补齐，不会挡住同批其它样品。
      </div>
      <div v-if="ledgerHit" class="notice notice-ok">
        该样品已办结并落入送检台账（台账编号 #{{ ledgerHit.id }}，办结日期 {{ ledgerHit.办结日期 }}）。
      </div>

      <div class="detail-actions">
        <button
          v-for="action in actions"
          :key="action"
          class="btn"
          :class="{ primary: action === '提交浮选' }"
          type="button"
          @click="runAction(action)"
        >
          {{ action }}
        </button>
        <span v-if="actions.length === 0" class="text-muted">当前「{{ row.status }}」为终态，没有可执行动作</span>
      </div>

      <p v-if="message" class="action-message" :class="messageOk ? 'ok' : 'bad'">{{ message }}</p>
    </article>

    <article v-else class="detail-card">
      <p class="empty-state">没有找到这条浮选样品，请从列表页进入。</p>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import { runFlotationAction } from '@/api/flotation-service'
import { ledgerEntries } from '@/api/local-service'
import {
  carbonizedSeedCount,
  COMPLETE_ACTION,
  DISCARD_ACTION,
  isDateMissing,
  isWeightMissing,
  sampleCode,
  sampleWeight,
  SUBMIT_ACTION,
  WEIGHT_LIMIT_KG,
} from '@/data/flotation-domain'
import { listRows } from '@/data/local-store'
import type { EntryRow } from '@/data/types'

const route = useRoute()
const id = Number(route.params.id)

// 明细页与列表页读的是同一份本地数据和同一套字段口径。
const row = ref<EntryRow | undefined>(listRows('flotation').find((item) => Number(item.id) === id))
const message = ref('')
const messageOk = ref(false)

const code = computed(() => (row.value ? sampleCode(row.value) : ''))
const seedCount = computed(() => (row.value ? carbonizedSeedCount(row.value) : 0))
const weight = computed(() => (row.value ? sampleWeight(row.value) : null))
const isOverweight = computed(
  () => row.value?.['超限'] === true || (weight.value !== null && weight.value > WEIGHT_LIMIT_KG),
)
const missing = computed(() => {
  if (!row.value) {
    return []
  }
  const lack: string[] = []
  if (isWeightMissing(row.value)) {
    lack.push('样品重量')
  }
  if (isDateMissing(row.value)) {
    lack.push('浮选日期')
  }
  return lack
})

const ledgerHit = computed(() =>
  ledgerEntries().find((entry) => entry.flotationId === id || entry.样品编号 === code.value),
)

const fields = computed(() => {
  if (!row.value) {
    return []
  }
  const source = row.value
  return [
    { label: '样品编号', value: sampleCode(source) },
    { label: '采样单位', value: source['采样单位'] || '—' },
    {
      label: `样品重量（kg，上限 ${WEIGHT_LIMIT_KG}）`,
      value: source['样品重量'] === '' || source['样品重量'] == null ? '—' : source['样品重量'],
    },
    { label: '浮选日期', value: source['浮选日期'] || '—' },
    { label: '炭屑含量', value: source['炭屑含量'] || '—' },
    { label: '送检去向', value: source['送检去向'] || '—' },
    { label: '登记样品状态', value: source['样品状态'] || '—' },
  ]
})

// 与列表页完全一致的逐级动作。
const actions = computed(() => {
  if (!row.value) {
    return []
  }
  switch (String(row.value.status)) {
    case '待浮选':
      return [SUBMIT_ACTION]
    case '浮选中':
      return [COMPLETE_ACTION]
    case '已完成':
      return [DISCARD_ACTION]
    default:
      return []
  }
})

const statusClass = computed(() => {
  if (!row.value) {
    return ''
  }
  const status = String(row.value.status)
  if (status === '已完成') {
    return 'tag-ok'
  }
  if (status === '已废弃') {
    return 'tag-bad'
  }
  return 'tag-info'
})

function runAction(action: string) {
  const result = runFlotationAction(id, action)
  messageOk.value = result.ok
  message.value = result.message
  if (result.ok) {
    row.value = listRows('flotation').find((item) => Number(item.id) === id)
  }
}
</script>

<style scoped>
.detail-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px 20px;
}
.detail-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.detail-head h3 {
  margin: 0;
  font-size: 18px;
}
.tag {
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
}
.tag-info {
  background: #eef2f7;
  color: #1f6feb;
}
.tag-ok {
  background: #e7f6ec;
  color: #067647;
}
.tag-bad {
  background: #fee4e2;
  color: #b42318;
}
.tag-warn {
  background: #fee4e2;
  color: #b42318;
}
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 24px;
  margin: 16px 0;
}
.detail-item dt {
  font-size: 12px;
  color: var(--muted);
}
.detail-item dd {
  margin: 2px 0 0;
  font-size: 14px;
}
.notice {
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  margin-bottom: 10px;
}
.notice-warn {
  background: #fffaeb;
  color: #b54708;
  border: 1px solid #fedf89;
}
.notice-ok {
  background: #ecfdf3;
  color: #067647;
  border: 1px solid #abefc6;
}
.detail-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.text-muted {
  color: #94a3b8;
  font-size: 13px;
}
.action-message {
  margin-top: 12px;
  font-size: 13px;
}
.action-message.ok {
  color: #067647;
}
.action-message.bad {
  color: #b42318;
}
</style>
