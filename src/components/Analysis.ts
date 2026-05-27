import { fetchAllPulls, fetchAllConsolePulls } from '../db.ts'
import type { PullRow, ConsolePullRow, StatKey } from '../types.ts'
import { STAT_LABELS } from '../types.ts'

// ── Types ────────────────────────────────────────────────
type AnyPull = PullRow | ConsolePullRow

interface GroupedRow {
  label: string
  total: number
  dc: number
  stats: Record<string, number>
}

type TableDef = {
  title: string
  labelHeader: string
  rows: GroupedRow[]
}

// ── Stat keys in display order ───────────────────────────
const STAT_KEYS: StatKey[] = [
  'has_flat_hp', 'has_flat_atk', 'has_flat_def',
  'has_hp_pct', 'has_atk_pct', 'has_def_pct',
  'has_dmg_pct', 'has_crit_rate', 'has_crit_dmg',
  'has_break_intensity', 'has_cycle_intensity',
]

const CRIT_KEYS: StatKey[] = ['has_crit_rate', 'has_crit_dmg']

// ── Helpers ──────────────────────────────────────────────
function isDualCrit(p: AnyPull): boolean {
  return p.has_crit_rate && p.has_crit_dmg
}

function groupPulls(
  pulls: AnyPull[],
  keyFn: (p: AnyPull) => string,
  orderedKeys: string[],
): GroupedRow[] {
  const map = new Map<string, GroupedRow>()
  for (const key of orderedKeys) {
    map.set(key, { label: key, total: 0, dc: 0, stats: Object.fromEntries(STAT_KEYS.map(k => [k, 0])) })
  }

  for (const p of pulls) {
    const key = keyFn(p)
    let row = map.get(key)
    if (!row) {
      row = { label: key, total: 0, dc: 0, stats: Object.fromEntries(STAT_KEYS.map(k => [k, 0])) }
      map.set(key, row)
    }
    row.total++
    if (isDualCrit(p)) row.dc++
    for (const sk of STAT_KEYS) {
      if (p[sk]) row.stats[sk]++
    }
  }

  return orderedKeys.map(k => map.get(k)!).filter(Boolean)
}

function buildMinuteEndTable(pulls: AnyPull[], prefix: string): TableDef {
  const keys = Array.from({ length: 10 }, (_, i) => `X${i}`)
  return {
    title: `${prefix} — Minute Last Digit`,
    labelHeader: 'Minutes',
    rows: groupPulls(pulls, p => `X${p.pull_minute % 10}`, keys),
  }
}

function buildSecondTable(pulls: AnyPull[], prefix: string): TableDef {
  const secs = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
  const keys = secs.map(s => `:${String(s).padStart(2, '0')}`)
  return {
    title: `${prefix} — Second Bucket`,
    labelHeader: 'Second',
    rows: groupPulls(pulls, p => `:${String(p.pull_second).padStart(2, '0')}`, keys),
  }
}

function buildHourTable(pulls: AnyPull[], prefix: string): TableDef {
  const hours = [...new Set(pulls.map(p => p.pull_hour))].sort((a, b) => a - b)
  const keys = hours.map(h => `${String(h).padStart(2, '0')}h`)
  return {
    title: `${prefix} — Per Hour`,
    labelHeader: 'Hour',
    rows: groupPulls(pulls, p => `${String(p.pull_hour).padStart(2, '0')}h`, keys),
  }
}

function buildLaneTable(pulls: AnyPull[], prefix: string): TableDef {
  const laneOrder = ['HE-ME-SE', 'HE-ME-SO', 'HE-MO-SE', 'HE-MO-SO', 'HO-ME-SE', 'HO-ME-SO', 'HO-MO-SE', 'HO-MO-SO']
  return {
    title: `${prefix} — Parity Lanes (H×M×S)`,
    labelHeader: 'Lane',
    rows: groupPulls(pulls, p => {
      const hp = p.pull_hour % 2 === 0 ? 'HE' : 'HO'
      const mp = p.pull_minute % 2 === 0 ? 'ME' : 'MO'
      const sp = p.pull_second % 2 === 0 ? 'SE' : 'SO'
      return `${hp}-${mp}-${sp}`
    }, laneOrder),
  }
}

function buildBatchTable(pulls: AnyPull[], prefix: string): TableDef {
  return {
    title: `${prefix} — x1 vs x10`,
    labelHeader: 'Batch',
    rows: groupPulls(pulls, p => p.batch_size === 10 ? 'x10' : 'x1', ['x1', 'x10']),
  }
}

// ── DOM Rendering ────────────────────────────────────────

function renderTable(table: TableDef): HTMLElement {
  const block = document.createElement('div')
  block.className = 'mb-8'

  const heading = document.createElement('h3')
  heading.className = 'text-sm font-bold text-purple-bright mb-2 pl-2 border-l-2 border-purple'
  heading.textContent = table.title
  block.appendChild(heading)

  const scrollWrap = document.createElement('div')
  scrollWrap.className = 'overflow-x-auto rounded-lg border border-border'

  const tbl = document.createElement('table')
  tbl.className = 'w-full text-xs border-collapse min-w-[800px]'

  // ── THEAD ──
  const thead = document.createElement('thead')
  const headerRow = document.createElement('tr')

  // Label col
  const thLabel = document.createElement('th')
  thLabel.className = 'sticky left-0 z-10 bg-[#00CED1] text-black font-bold text-left px-3 py-2 text-xs'
  thLabel.textContent = table.labelHeader
  headerRow.appendChild(thLabel)

  // Stat cols
  for (const sk of STAT_KEYS) {
    const th = document.createElement('th')
    const isCrit = CRIT_KEYS.includes(sk)
    th.className = isCrit
      ? 'bg-[#FFD700] text-black font-bold px-2 py-2 text-center text-[10px] whitespace-nowrap'
      : 'bg-surface-raised text-text-muted font-semibold px-2 py-2 text-center text-[10px] whitespace-nowrap'
    th.textContent = STAT_LABELS[sk]
    headerRow.appendChild(th)
  }

  // DC col
  const thDC = document.createElement('th')
  thDC.className = 'bg-red text-white font-bold px-2 py-2 text-center text-[10px]'
  thDC.textContent = 'DC'
  headerRow.appendChild(thDC)

  const thDCPct = document.createElement('th')
  thDCPct.className = 'bg-red text-white font-bold px-2 py-2 text-center text-[10px]'
  thDCPct.textContent = 'DC%'
  headerRow.appendChild(thDCPct)

  // Total col
  const thTotal = document.createElement('th')
  thTotal.className = 'bg-surface-raised text-text font-bold px-2 py-2 text-center text-[10px]'
  thTotal.textContent = 'Total'
  headerRow.appendChild(thTotal)

  thead.appendChild(headerRow)
  tbl.appendChild(thead)

  // ── TBODY ──
  const tbody = document.createElement('tbody')

  for (const row of table.rows) {
    const tr = document.createElement('tr')

    const dcRate = row.total > 0 ? row.dc / row.total : 0
    const isDead = row.dc === 0 && row.total >= 5
    const isHot = dcRate >= 0.20 && row.total >= 3

    if (isDead) {
      tr.className = 'bg-red/5'
    } else if (isHot) {
      tr.className = 'bg-green/5'
    } else {
      tr.className = 'hover:bg-surface-raised/50'
    }

    // Label cell
    const tdLabel = document.createElement('td')
    tdLabel.className = isDead
      ? 'sticky left-0 z-10 bg-red/80 text-white font-bold text-left px-3 py-1.5 whitespace-nowrap'
      : isHot
        ? 'sticky left-0 z-10 bg-green/80 text-black font-bold text-left px-3 py-1.5 whitespace-nowrap'
        : 'sticky left-0 z-10 bg-[#00CED1] text-black font-bold text-left px-3 py-1.5 whitespace-nowrap'
    tdLabel.textContent = row.label
    tr.appendChild(tdLabel)

    if (row.total === 0) {
      for (let i = 0; i < STAT_KEYS.length + 3; i++) {
        const td = document.createElement('td')
        td.className = 'text-center text-text-dim px-2 py-1.5 border-b border-border-subtle'
        td.textContent = '—'
        tr.appendChild(td)
      }
    } else {
      // Stat cells
      for (const sk of STAT_KEYS) {
        const val = row.stats[sk] || 0
        const pct = row.total > 0 ? ((val / row.total) * 100).toFixed(0) : '0'
        const td = document.createElement('td')
        const isCrit = CRIT_KEYS.includes(sk)
        td.className = isCrit
          ? 'text-center px-2 py-1.5 border-b border-border-subtle bg-[#FFD700]/5'
          : 'text-center px-2 py-1.5 border-b border-border-subtle'

        const numSpan = document.createElement('span')
        numSpan.className = 'text-text'
        numSpan.textContent = String(val)

        const pctSpan = document.createElement('span')
        pctSpan.className = 'text-text-dim text-[9px] ml-0.5'
        pctSpan.textContent = ` (${pct}%)`

        td.appendChild(numSpan)
        td.appendChild(pctSpan)
        tr.appendChild(td)
      }

      // DC count
      const tdDC = document.createElement('td')
      tdDC.className = 'text-center font-bold px-2 py-1.5 border-b border-border-subtle text-red'
      tdDC.textContent = String(row.dc)
      tr.appendChild(tdDC)

      // DC%
      const tdDCPct = document.createElement('td')
      const dcPctStr = (dcRate * 100).toFixed(1) + '%'
      tdDCPct.className = isHot
        ? 'text-center font-bold px-2 py-1.5 border-b border-border-subtle text-green'
        : isDead
          ? 'text-center font-bold px-2 py-1.5 border-b border-border-subtle text-text-dim'
          : 'text-center font-bold px-2 py-1.5 border-b border-border-subtle text-red'
      tdDCPct.textContent = dcPctStr
      tr.appendChild(tdDCPct)

      // Total
      const tdTotal = document.createElement('td')
      tdTotal.className = 'text-center font-semibold px-2 py-1.5 border-b border-border-subtle text-text-muted'
      tdTotal.textContent = String(row.total)
      tr.appendChild(tdTotal)
    }

    tbody.appendChild(tr)
  }

  tbl.appendChild(tbody)

  // ── TFOOT ──
  const tfoot = document.createElement('tfoot')
  const totalRow = document.createElement('tr')
  totalRow.className = 'bg-surface-raised border-t-2 border-purple'

  const tdTotalLabel = document.createElement('td')
  tdTotalLabel.className = 'sticky left-0 z-10 bg-[#00808a] text-white font-bold text-left px-3 py-2'
  tdTotalLabel.textContent = 'TOTAL'
  totalRow.appendChild(tdTotalLabel)

  let grandTotal = 0
  let grandDC = 0
  const grandStats: Record<string, number> = {}
  for (const sk of STAT_KEYS) grandStats[sk] = 0

  for (const row of table.rows) {
    grandTotal += row.total
    grandDC += row.dc
    for (const sk of STAT_KEYS) grandStats[sk] += (row.stats[sk] || 0)
  }

  for (const sk of STAT_KEYS) {
    const td = document.createElement('td')
    const isCrit = CRIT_KEYS.includes(sk)
    td.className = isCrit
      ? 'text-center font-bold px-2 py-2 bg-[#FFD700]/5 text-text'
      : 'text-center font-bold px-2 py-2 text-text'
    td.textContent = String(grandStats[sk])
    totalRow.appendChild(td)
  }

  const tdGDC = document.createElement('td')
  tdGDC.className = 'text-center font-bold px-2 py-2 text-red'
  tdGDC.textContent = String(grandDC)
  totalRow.appendChild(tdGDC)

  const tdGDCPct = document.createElement('td')
  tdGDCPct.className = 'text-center font-bold px-2 py-2 text-red'
  tdGDCPct.textContent = grandTotal > 0 ? (grandDC / grandTotal * 100).toFixed(1) + '%' : '0%'
  totalRow.appendChild(tdGDCPct)

  const tdGTotal = document.createElement('td')
  tdGTotal.className = 'text-center font-bold px-2 py-2 text-text'
  tdGTotal.textContent = String(grandTotal)
  totalRow.appendChild(tdGTotal)

  tfoot.appendChild(totalRow)
  tbl.appendChild(tfoot)

  scrollWrap.appendChild(tbl)
  block.appendChild(scrollWrap)
  return block
}

function renderServerSection(
  pulls: AnyPull[],
  serverName: string,
): HTMLElement {
  const section = document.createElement('div')
  section.className = 'space-y-6'

  if (pulls.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'text-center text-text-muted py-12 text-sm'
    empty.textContent = `No ${serverName} pulls found.`
    section.appendChild(empty)
    return section
  }

  // Stats summary bar
  const bar = document.createElement('div')
  bar.className = 'flex flex-wrap items-center gap-6 mb-4 px-2'

  const dcCount = pulls.filter(p => isDualCrit(p)).length
  const dcRate = ((dcCount / pulls.length) * 100).toFixed(1)

  const items = [
    { num: String(pulls.length), lbl: 'Pulls' },
    { num: String(dcCount), lbl: 'Dual Crits' },
    { num: dcRate + '%', lbl: 'DC Rate' },
    { num: String(pulls.filter(p => p.batch_size === 1).length), lbl: 'x1' },
    { num: String(pulls.filter(p => p.batch_size === 10).length), lbl: 'x10' },
  ]

  for (const item of items) {
    const div = document.createElement('div')
    div.className = 'text-center'
    const numEl = document.createElement('div')
    numEl.className = 'text-xl font-bold text-gold-bright tabular-nums'
    numEl.textContent = item.num
    const lblEl = document.createElement('div')
    lblEl.className = 'text-[10px] text-text-muted uppercase tracking-wider'
    lblEl.textContent = item.lbl
    div.appendChild(numEl)
    div.appendChild(lblEl)
    bar.appendChild(div)
  }

  section.appendChild(bar)

  // Build tables
  const tables: TableDef[] = [
    buildMinuteEndTable(pulls, serverName),
    buildSecondTable(pulls, serverName),
    buildHourTable(pulls, serverName),
    buildLaneTable(pulls, serverName),
    buildBatchTable(pulls, serverName),
  ]

  for (const t of tables) {
    section.appendChild(renderTable(t))
  }

  return section
}

function renderQuickRef(): HTMLElement {
  const box = document.createElement('div')
  box.className = 'rounded-lg border border-purple/30 bg-surface-raised p-4 mb-6'

  const title = document.createElement('h3')
  title.className = 'text-sm font-bold text-purple-bright mb-3'
  title.textContent = 'Quick Manipulation Guide'
  box.appendChild(title)

  const rules: { type: 'do' | 'dont'; text: string }[] = [
    { type: 'do', text: 'Always use x1 pulls (16.4% DC vs x10\'s 6.0%)' },
    { type: 'do', text: 'Odd hour → Even minute | Even hour → Odd minute' },
    { type: 'do', text: 'Target seconds: :20 (30.8%), :50 (23.1%), :30 (18.4%)' },
    { type: 'do', text: 'Best minute endings: X3 (33%), X2 (21%), X5 (20%)' },
    { type: 'dont', text: 'Never odd minute at odd hour (0/28 = permanently dead)' },
    { type: 'dont', text: 'Never seconds :10, :35, :45 (0% DC at any sample)' },
    { type: 'dont', text: 'Never minutes ending in 1 (0/33, p<0.01)' },
    { type: 'dont', text: 'Avoid :20 at even hour + even minute (lane-specific dead)' },
  ]

  for (const rule of rules) {
    const row = document.createElement('div')
    row.className = 'flex items-start gap-2 mb-1.5 text-xs'

    const tag = document.createElement('span')
    tag.className = rule.type === 'do'
      ? 'shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-green text-black'
      : 'shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red text-white'
    tag.textContent = rule.type === 'do' ? 'DO' : 'DON\'T'

    const text = document.createElement('span')
    text.className = 'text-text'
    text.textContent = rule.text

    row.appendChild(tag)
    row.appendChild(text)
    box.appendChild(row)
  }

  return box
}

// ── Legend ────────────────────────────────────────────────
function renderLegend(): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'flex flex-wrap items-center gap-4 mb-4 px-2 text-[10px] text-text-muted'

  const items: { color: string; label: string }[] = [
    { color: 'bg-green/80', label: 'HOT (DC ≥ 20%)' },
    { color: 'bg-red/80', label: 'DEAD (DC = 0%, 5+ pulls)' },
    { color: 'bg-[#FFD700]', label: 'CRIT columns' },
    { color: 'bg-red', label: 'Dual Crit columns' },
    { color: 'bg-[#00CED1]', label: 'Row label' },
  ]

  for (const item of items) {
    const div = document.createElement('div')
    div.className = 'flex items-center gap-1'
    const swatch = document.createElement('span')
    swatch.className = `inline-block w-3 h-3 rounded-sm ${item.color}`
    const lbl = document.createElement('span')
    lbl.textContent = item.label
    div.appendChild(swatch)
    div.appendChild(lbl)
    wrap.appendChild(div)
  }

  return wrap
}

// ── Mount function ───────────────────────────────────────
export function mountAnalysis(
  container: HTMLElement,
): { refresh: () => Promise<void> } {
  const wrap = document.createElement('div')
  wrap.className = 'flex flex-col gap-4 p-4 max-w-[1400px] mx-auto w-full'
  container.appendChild(wrap)

  // Title
  const pageTitle = document.createElement('h2')
  pageTitle.className = 'text-lg font-black tracking-widest uppercase bg-gradient-to-r from-purple-bright to-gold-bright bg-clip-text text-transparent'
  pageTitle.textContent = 'Substat Analysis'
  wrap.appendChild(pageTitle)

  // Quick ref
  wrap.appendChild(renderQuickRef())
  wrap.appendChild(renderLegend())

  // Tab bar for EU / NA / Global
  const tabBar = document.createElement('div')
  tabBar.className = 'flex items-center gap-1 bg-surface-raised border border-border rounded p-0.5 w-fit mb-4'

  const tabs = ['EU', 'NA', 'Global'] as const
  type TabId = typeof tabs[number]
  let activeTab: TabId = 'Global'

  const tabBtns: Record<string, HTMLButtonElement> = {}
  const tabPanels: Record<string, HTMLDivElement> = {}

  for (const tabId of tabs) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'px-3 py-1.5 text-xs font-bold rounded transition-all'
    btn.textContent = tabId
    tabBtns[tabId] = btn

    const panel = document.createElement('div')
    panel.className = 'hidden'
    tabPanels[tabId] = panel

    btn.addEventListener('click', () => {
      activeTab = tabId
      refreshTabs()
    })

    tabBar.appendChild(btn)
  }

  wrap.appendChild(tabBar)

  // Panel container
  const panelContainer = document.createElement('div')
  for (const tabId of tabs) {
    panelContainer.appendChild(tabPanels[tabId])
  }
  wrap.appendChild(panelContainer)

  // Loading indicator
  const loader = document.createElement('div')
  loader.className = 'text-center text-text-muted py-12 text-sm'
  loader.textContent = 'Loading pull data...'
  wrap.appendChild(loader)

  function refreshTabs() {
    for (const tabId of tabs) {
      const isActive = tabId === activeTab
      tabBtns[tabId].classList.toggle('bg-purple', isActive)
      tabBtns[tabId].classList.toggle('text-white', isActive)
      tabBtns[tabId].classList.toggle('shadow-sm', isActive)
      tabBtns[tabId].classList.toggle('text-text-muted', !isActive)
      tabPanels[tabId].classList.toggle('hidden', !isActive)
      tabPanels[tabId].classList.toggle('block', isActive)
    }
  }

  async function refresh() {
    loader.classList.remove('hidden')
    for (const tabId of tabs) {
      while (tabPanels[tabId].firstChild) tabPanels[tabId].removeChild(tabPanels[tabId].firstChild)
    }

    try {
      const [rewindPulls, consolePulls] = await Promise.all([
        fetchAllPulls('all', 'all', 5000, true),
        fetchAllConsolePulls('all', 'all', 5000, true),
      ])

      const allPulls: AnyPull[] = [...rewindPulls, ...consolePulls]

      const euPulls = allPulls.filter(p => p.server_region === 'EU')
      const naPulls = allPulls.filter(p => p.server_region === 'NA')

      tabPanels['EU'].appendChild(renderServerSection(euPulls, 'EU Server'))
      tabPanels['NA'].appendChild(renderServerSection(naPulls, 'NA Server'))
      tabPanels['Global'].appendChild(renderServerSection(allPulls, 'Global (All Servers)'))

      loader.classList.add('hidden')
    } catch (err) {
      loader.textContent = `Error loading data: ${err instanceof Error ? err.message : String(err)}`
      loader.className = 'text-center text-red py-12 text-sm'
    }

    refreshTabs()
  }

  // Initial load
  refresh()
  refreshTabs()

  return { refresh }
}
