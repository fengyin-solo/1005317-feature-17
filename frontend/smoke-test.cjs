// 浮选批量业务规则的无浏览器冒烟验证：用 node 跑，模拟 localStorage。
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const harness = `
globalThis.__store = {}
globalThis.window = {
  localStorage: {
    getItem: (k) => (k in globalThis.__store ? globalThis.__store[k] : null),
    setItem: (k, v) => { globalThis.__store[k] = String(v) },
    removeItem: (k) => { delete globalThis.__store[k] },
  },
}
`

async function main() {
  const outDir = path.join(process.cwd(), '.smoke')
  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })

  const entry = path.join(outDir, 'entry.ts')
  fs.writeFileSync(
    entry,
    `${harness}
import { runFlotationBatch } from '../src/api/flotation-service'
import { listRows, resetRows } from '../src/data/local-store'
import { listLedger } from '../src/data/ledger-store'
import { ACTIONS } from '../src/data/flotation'

let failures = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log('PASS | ' + name)
  } else {
    failures += 1
    console.log('FAIL | ' + name + (detail ? ' :: ' + detail : ''))
  }
}

resetRows('flotation')
// id: 1 正常 8.5kg; 2 正常 12kg; 3 缺重量; 4 缺日期; 5 超重 25kg;
// 6 正常 18kg; 7 浮选中; 8 已完成; 9 与2同编号; 10 已废弃
const before = listRows('flotation')
check('种子数据 10 条', before.length === 10, String(before.length))

// 场景一：全量勾选提交浮选
const r1 = runFlotationBatch(before.map((r) => Number(r.id)), ACTIONS.submit)
const after1 = listRows('flotation')
check('批量返回有成功件', r1.successCount > 0, JSON.stringify(r1.items.map((i) => i.kind)))
check('成功件应为 1,2,6 共3条', r1.successCount === 3, '成功=' + r1.successCount)
const successIds = r1.items.filter((i) => i.kind === 'success').map((i) => i.id).sort()
check('成功编号集合', JSON.stringify(successIds) === JSON.stringify([1, 2, 6]), JSON.stringify(successIds))
check('缺重量的 id=3 被挑出', r1.items.some((i) => i.id === 3 && i.kind === 'missing' && i.reason.includes('样品重量')))
check('缺日期的 id=4 被挑出', r1.items.some((i) => i.id === 4 && i.kind === 'missing' && i.reason.includes('浮选日期')))
check('超重 id=5 单独拦截', r1.items.some((i) => i.id === 5 && i.kind === 'overweight'))
check('超重件集合只含 id=5', JSON.stringify(r1.overweightItems.map((i) => i.id)) === JSON.stringify([5]))
check('重复编号 id=9 只算一条不处理', r1.items.some((i) => i.id === 9 && i.kind === 'duplicate'))
check('缺字段/超重不挡整批(ok=true)', r1.ok === true)
check('id=1 推进到浮选中', after1.find((r) => r.id === 1)?.status === '浮选中')
check('id=3 缺重量仍为待浮选', after1.find((r) => r.id === 3)?.status === '待浮选')
check('id=5 状态未动', after1.find((r) => r.id === 5)?.status === '待浮选')
check('id=5 被打上超限标注', String(after1.find((r) => r.id === 5)?.['超限标注'] ?? '').includes('25'))
check('已完成 id=8 再提交被拦下并说明', r1.items.some((i) => i.id === 8 && i.kind === 'blocked' && i.reason.includes('已完成')))
check('浮选中 id=7 越级提交被拦', r1.items.some((i) => i.id === 7 && i.kind === 'blocked'))
check('已废弃 id=10 提交被拦', r1.items.some((i) => i.id === 10 && i.kind === 'blocked'))

// 场景二：已完成的再次提交浮选（单独点名）
const r2 = runFlotationBatch([8], ACTIONS.submit)
check('已完成再提交 ok=false', r2.ok === false)
check('原因说明含"不能再提交浮选"', r2.items[0].reason.includes('不能再提交浮选'), r2.items[0].reason)

// 场景三：待浮选直接确认完成（越级）应拦下
const r3 = runFlotationBatch([3], ACTIONS.complete)
check('待浮选越级确认完成被拦', r3.ok === false && r3.items[0].kind === 'blocked')

// 场景四：浮选中的 1,2 确认完成 → 落台账
const r4 = runFlotationBatch([1, 2], ACTIONS.complete)
check('两条办结成功', r4.successCount === 2)
const done = listRows('flotation')
check('办结后状态为已完成', done.find((r) => r.id === 1)?.status === '已完成' && done.find((r) => r.id === 2)?.status === '已完成')
check('办结 pending=false', done.find((r) => r.id === 1)?.pending === false)
const ledger1 = listLedger()
check('台账落入2条', ledger1.length === 2, '台账=' + ledger1.length)
check('台账编号自动生成', ledger1.every((l) => /^LED-\\d{4}$/.test(l.ledgerNo)), JSON.stringify(ledger1.map((l) => l.ledgerNo)))
check('台账炭化种子数取统一口径', ledger1.every((l) => typeof l.carbonSeeds === 'number'))
check('台账含样品编号', ledger1.some((l) => l.sampleCode === 'FLOT-2026-001'))

// 场景五：重复办结同一样品，台账不重复记
const r5 = runFlotationBatch([1], ACTIONS.complete)
check('已完成再确认完成被状态拦下', r5.ok === false)
check('台账仍只有2条', listLedger().length === 2)

// 场景六：浮选中→已废弃（逐级），待浮选→已废弃被拦
const r6a = runFlotationBatch([7], ACTIONS.abandon)
check('浮选中直接废弃属越级被拦', r6a.ok === false, r6a.items[0].reason)
const r6b = runFlotationBatch([1], ACTIONS.abandon)
check('已完成可以登记废弃(逐级)', r6b.ok === true && r6b.items[0].status === '已废弃')
check('废弃标记 abnormal', listRows('flotation').find((r) => r.id === 1)?.abnormal === true)

// 场景七：同批里同一编号手动重复 id（防同批重复，即便不同行）
// id=6 此时为浮选中，先逐级办结，再在同一批里重复勾选废弃：只处理第一次
runFlotationBatch([6], ACTIONS.complete)
const r7 = runFlotationBatch([6, 6], ACTIONS.abandon)
check('同编号重复勾选只处理一次', r7.successCount === 1 && r7.items[1].kind === 'duplicate', JSON.stringify(r7.items.map((i) => i.kind)))

// 场景八：缺字段单条提交浮选不报错且 ok=false
const r8 = runFlotationBatch([3], ACTIONS.submit)
check('缺重量单件被挑出', r8.ok === false && r8.items[0].kind === 'missing')

console.log(failures === 0 ? 'ALL_SMOKE_TESTS_PASSED' : ('SMOKE_FAILURES=' + failures))
if (failures > 0) process.exit(1)
`,
  )

  try {
    const esbuildBin = path.join(process.cwd(), 'node_modules/@esbuild/linux-arm64/bin/esbuild')
  execSync(`${esbuildBin} ${entry} --bundle --platform=node --format=esm --outfile=${path.join(outDir, 'out.mjs')} --log-level=warning`, { stdio: ['ignore', 'inherit', 'inherit'] })
    execSync(`node ${path.join(outDir, 'out.mjs')}`, { stdio: ['ignore', 'inherit', 'inherit'] })
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
