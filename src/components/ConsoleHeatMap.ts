import { type StatKey, type SecondOption, type DateFilter, type ServerRegion, SECOND_OPTIONS, STAT_LABELS, DATE_FILTER_OPTIONS, SERVER_FILTER_OPTIONS } from '../types.ts'
import { fetchAllConsolePulls, normalizeError } from '../db.ts'
import type { ConsolePullRow } from '../types.ts'

export interface ConsoleHeatMapCallbacks {
  onSecondSelected: (second: SecondOption | null) => void
}

export function mountConsoleHeatMap(container: HTMLElement, callbacks: ConsoleHeatMapCallbacks) {
  let selectedSecond: SecondOption | null = null
  let selectedStats = new Set<StatKey>()
  let hourFilter: 'all' | 'current' | -1 | -2 = 'all'
  let dateFilter: DateFilter = 'all'
  let serverFilter: ServerRegion | 'all' = 'all'
  let allPulls: ConsolePullRow[] = []
  let refreshTimer: number | null = null

  const wrap = document.createElement('div')
  wrap.className = 'flex flex-col bg-surface/90 backdrop-blur-xl border border-border-subtle rounded-lg p-4 shadow-lg'

  // Header
  const header = document.createElement('div')
  header.className = 'font-extrabold text-[0.65rem] tracking-widest uppercase text-text-muted mb-2 flex items-center justify-between'

  const headerText = document.createElement('span')
  headerText.textContent = 'Console Heatmap'
  header.appendChild(headerText)

  const refreshBtn = document.createElement('button')
  refreshBtn.className = 'bg-transparent text-text-dim border border-border rounded px-2 py-1 text-xs font-bold cursor-pointer transition-all hover:text-text-muted hover:bg-surface-raised'
  refreshBtn.type = 'button'
  refreshBtn.textContent = 'Refresh'
  refreshBtn.addEventListener('click', () => load(true))
  header.appendChild(refreshBtn)
  wrap.appendChild(header)

  // Stat filter
  const statFilterRow = document.createElement('div')
  statFilterRow.className = 'flex items-center gap-2 flex-wrap mb-2'

  const statFilterLabel = document.createElement('span')
  statFilterLabel.className = 'text-[0.65rem] font-bold text-text-muted uppercase tracking-wider whitespace-nowrap'
  statFilterLabel.textContent = 'Stats'
  statFilterRow.appendChild(statFilterLabel)

  const statFilterButtons = new Map<StatKey, HTMLButtonElement>()
  const statKeys = Object.keys(STAT_LABELS) as StatKey[]
  for (const key of statKeys) {
    const btn = document.createElement('button')
    btn.className = 'bg-surface-raised border border-border rounded px-1.5 py-0.5 text-[0.65rem] font-bold text-text-muted cursor-pointer transition-all hover:bg-border hover:text-text'
    btn.type = 'button'
    btn.textContent = STAT_LABELS[key]
    btn.addEventListener('click', () => {
      if (selectedStats.has(key)) {
        selectedStats.delete(key)
      } else {
        selectedStats.add(key)
      }
      refreshStatFilterButtons()
      render()
    })
    statFilterButtons.set(key, btn)
    statFilterRow.appendChild(btn)
  }
  wrap.appendChild(statFilterRow)

  // Hour filter
  const hourFilterRow = document.createElement('div')
  hourFilterRow.className = 'flex items-center gap-2 flex-wrap mb-2'

  const hourFilterLabel = document.createElement('span')
  hourFilterLabel.className = 'text-[0.65rem] font-bold text-text-muted uppercase tracking-wider whitespace-nowrap'
  hourFilterLabel.textContent = 'Window'
  hourFilterRow.appendChild(hourFilterLabel)

  const hourOptions: { label: string; value: 'all' | 'current' | -1 | -2 }[] = [
    { label: 'All', value: 'all' },
    { label: 'Now', value: 'current' },
    { label: '-1h', value: -1 },
    { label: '-2h', value: -2 },
  ]

  const hourButtons = new Map<string, HTMLButtonElement>()
  for (const opt of hourOptions) {
    const btn = document.createElement('button')
    btn.className = 'bg-surface-raised border border-border rounded px-1.5 py-0.5 text-[0.7rem] font-bold text-text-muted cursor-pointer transition-all hover:bg-border hover:text-text'
    btn.type = 'button'
    btn.textContent = opt.label
    btn.addEventListener('click', () => {
      hourFilter = opt.value
      refreshHourButtons()
      render()
    })
    hourButtons.set(String(opt.value), btn)
    hourFilterRow.appendChild(btn)
  }

  const clearBtn = document.createElement('button')
  clearBtn.className = 'bg-transparent text-text-dim border border-border rounded px-1.5 py-0.5 text-xs font-bold cursor-pointer transition-all hover:text-text-muted hover:bg-surface-raised'
  clearBtn.type = 'button'
  clearBtn.textContent = 'Clear'
  clearBtn.addEventListener('click', () => {
    selectedStats.clear()
    refreshStatFilterButtons()
    render()
  })
  hourFilterRow.appendChild(clearBtn)
  wrap.appendChild(hourFilterRow)

  // Date filter
  const dateFilterRow = document.createElement('div')
  dateFilterRow.className = 'flex items-center gap-2 flex-wrap mb-2'

  const dateFilterLabel = document.createElement('span')
  dateFilterLabel.className = 'text-[0.65rem] font-bold text-text-muted uppercase tracking-wider whitespace-nowrap'
  dateFilterLabel.textContent = 'Date'
  dateFilterRow.appendChild(dateFilterLabel)

  const dateButtons = new Map<string, HTMLButtonElement>()
  for (const opt of DATE_FILTER_OPTIONS) {
    const btn = document.createElement('button')
    btn.className = 'bg-surface-raised border border-border rounded px-1.5 py-0.5 text-[0.7rem] font-bold text-text-muted cursor-pointer transition-all hover:bg-border hover:text-text'
    btn.type = 'button'
    btn.textContent = opt.label
    btn.addEventListener('click', () => {
      dateFilter = opt.value
      refreshDateButtons()
      load(true)
    })
    dateButtons.set(opt.value, btn)
    dateFilterRow.appendChild(btn)
  }
  wrap.appendChild(dateFilterRow)

  // Server filter
  const serverFilterRow = document.createElement('div')
  serverFilterRow.className = 'flex items-center gap-2 flex-wrap mb-2'

  const serverFilterLabel = document.createElement('span')
  serverFilterLabel.className = 'text-[0.65rem] font-bold text-text-muted uppercase tracking-wider whitespace-nowrap'
  serverFilterLabel.textContent = 'Server'
  serverFilterRow.appendChild(serverFilterLabel)

  const serverButtons = new Map<string, HTMLButtonElement>()
  for (const opt of SERVER_FILTER_OPTIONS) {
    const btn = document.createElement('button')
    btn.className = 'bg-surface-raised border border-border rounded px-1.5 py-0.5 text-[0.7rem] font-bold text-text-muted cursor-pointer transition-all hover:bg-border hover:text-text'
    btn.type = 'button'
    btn.textContent = opt.label
    btn.addEventListener('click', () => {
      serverFilter = opt.value
      refreshServerButtons()
      load(true)
    })
    serverButtons.set(opt.value, btn)
    serverFilterRow.appendChild(btn)
  }
  wrap.appendChild(serverFilterRow)

  // Grid
  const grid = document.createElement('div')
  grid.className = 'grid grid-cols-4 md:grid-cols-6 gap-2'
  wrap.appendChild(grid)

  container.appendChild(wrap)

  const cellMap = new Map<SecondOption, HTMLButtonElement>()

  for (const sec of SECOND_OPTIONS) {
    const cell = document.createElement('button')
    cell.className = 'relative flex flex-col items-center justify-center gap-1 py-2.5 px-1.5 rounded border bg-surface-raised border-border cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-xl'
    cell.type = 'button'

    const label = document.createElement('div')
    label.className = 'font-extrabold text-base text-text tracking-wide'
    label.textContent = `:${sec.toString().padStart(2, '0')}`

    const pct = document.createElement('div')
    pct.className = 'sec-pct font-extrabold text-sm text-green tracking-wide'

    const meta = document.createElement('div')
    meta.className = 'sec-meta text-[0.65rem] text-text-muted text-center font-semibold'

    cell.appendChild(label)
    cell.appendChild(pct)
    cell.appendChild(meta)

    cell.addEventListener('click', () => {
      if (selectedSecond === sec) {
        selectedSecond = null
      } else {
        selectedSecond = sec
      }
      updateSelection()
      callbacks.onSecondSelected(selectedSecond)
    })

    cellMap.set(sec, cell)
    grid.appendChild(cell)
  }

  // Status footer below grid so card feels finished
  const statusText = document.createElement('div')
  statusText.className = 'text-xs text-text-muted text-center py-2 font-semibold border-t border-border-subtle mt-2'
  wrap.appendChild(statusText)

  refreshHourButtons()
  refreshDateButtons()
  refreshServerButtons()

  function refreshServerButtons() {
    for (const [value, btn] of serverButtons.entries()) {
      const active = serverFilter === value
      btn.classList.toggle('bg-gradient-to-br', active)
      btn.classList.toggle('from-gold', active)
      btn.classList.toggle('to-gold-dim', active)
      btn.classList.toggle('text-white', active)
      btn.classList.toggle('border-gold-bright', active)
      btn.classList.toggle('shadow-lg', active)
      btn.classList.toggle('shadow-gold/15', active)
      btn.classList.toggle('bg-surface-raised', !active)
      btn.classList.toggle('border-border', !active)
      btn.classList.toggle('text-text-muted', !active)
    }
  }

  function refreshStatFilterButtons() {
    for (const [key, btn] of statFilterButtons.entries()) {
      const active = selectedStats.has(key)
      btn.classList.toggle('bg-green/18', active)
      btn.classList.toggle('text-green', active)
      btn.classList.toggle('border-green-dim', active)
      btn.classList.toggle('shadow-lg', active)
      btn.classList.toggle('shadow-green/15', active)
      btn.classList.toggle('bg-surface-raised', !active)
      btn.classList.toggle('border-border', !active)
      btn.classList.toggle('text-text-muted', !active)
    }
  }

  function refreshHourButtons() {
    for (const [value, btn] of hourButtons.entries()) {
      const active = String(hourFilter) === value
      btn.classList.toggle('bg-gradient-to-br', active)
      btn.classList.toggle('from-purple', active)
      btn.classList.toggle('to-purple-dim', active)
      btn.classList.toggle('text-white', active)
      btn.classList.toggle('border-purple-bright', active)
      btn.classList.toggle('shadow-lg', active)
      btn.classList.toggle('shadow-purple/15', active)
      btn.classList.toggle('bg-surface-raised', !active)
      btn.classList.toggle('border-border', !active)
      btn.classList.toggle('text-text-muted', !active)
    }
  }

  function refreshDateButtons() {
    for (const [value, btn] of dateButtons.entries()) {
      const active = dateFilter === value
      btn.classList.toggle('bg-gradient-to-br', active)
      btn.classList.toggle('from-purple', active)
      btn.classList.toggle('to-purple-dim', active)
      btn.classList.toggle('text-white', active)
      btn.classList.toggle('border-purple-bright', active)
      btn.classList.toggle('shadow-lg', active)
      btn.classList.toggle('shadow-purple/15', active)
      btn.classList.toggle('bg-surface-raised', !active)
      btn.classList.toggle('border-border', !active)
      btn.classList.toggle('text-text-muted', !active)
    }
  }

  function updateSelection() {
    for (const [sec, cell] of cellMap.entries()) {
      const active = sec === selectedSecond
      cell.classList.toggle('border-gold', active)
      cell.classList.toggle('ring-2', active)
      cell.classList.toggle('ring-gold/15', active)
      cell.classList.toggle('shadow-xl', active)
      cell.classList.toggle('z-10', active)
      cell.classList.toggle('border-border', !active)
    }
  }

  function getCurrentHour(): number {
    return new Date().getHours()
  }

  function matchesHourFilter(row: ConsolePullRow): boolean {
    if (hourFilter === 'all') return true
    const current = getCurrentHour()
    if (hourFilter === 'current') return row.pull_hour === current
    if (hourFilter === -1) return row.pull_hour === (current - 1 + 24) % 24
    if (hourFilter === -2) return row.pull_hour === (current - 2 + 24) % 24
    return true
  }

  function aggregateData(): Map<SecondOption, { total: number; match: number }> {
    const result = new Map<SecondOption, { total: number; match: number }>()
    for (const sec of SECOND_OPTIONS) {
      result.set(sec, { total: 0, match: 0 })
    }

    for (const pull of allPulls) {
      if (!matchesHourFilter(pull)) continue
      const bucket = result.get(pull.pull_second)
      if (!bucket) continue
      bucket.total++

      if (selectedStats.size === 0) {
        bucket.match++
      } else {
        let allPresent = true
        for (const stat of selectedStats) {
          if (!(pull as unknown as Record<string, boolean>)[stat]) {
            allPresent = false
            break
          }
        }
        if (allPresent) bucket.match++
      }
    }

    return result
  }

  function colorClassNoStats(total: number): string {
    if (total === 0) return 'border-border bg-surface-raised'
    if (total <= 5) return 'border-gold-dim bg-gold-dim/20'
    if (total <= 20) return 'border-gold bg-gold/20'
    if (total <= 50) return 'border-orange-dim bg-orange-dim/25'
    return 'border-gold bg-gold/25 shadow-[inset_0_0_20px_rgba(245,158,11,0.05)]'
  }

  function colorClassWithStats(pct: number, total: number): string {
    if (total === 0) return 'border-border bg-surface-raised'
    if (pct === 0) return 'border-border bg-surface-raised'
    if (pct <= 15) return 'border-gold-dim bg-gold-dim/20'
    if (pct <= 30) return 'border-gold bg-gold/20'
    if (pct <= 50) return 'border-orange-dim bg-orange-dim/25'
    return 'border-gold bg-gold/25 shadow-[inset_0_0_20px_rgba(245,158,11,0.05)]'
  }

  function render() {
    const data = aggregateData()
    const hasStats = selectedStats.size > 0

    for (const sec of SECOND_OPTIONS) {
      const bucket = data.get(sec)!
      const cell = cellMap.get(sec)!
      const total = bucket.total
      const match = bucket.match

      const pctEl = cell.querySelector('.sec-pct') as HTMLDivElement
      const metaEl = cell.querySelector('.sec-meta') as HTMLDivElement

      // Reset classes
      cell.className = 'relative flex flex-col items-center justify-center gap-1 py-2.5 px-1.5 rounded border cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-xl'
      const colorClass = !hasStats ? colorClassNoStats(total) : colorClassWithStats(total > 0 ? Math.round((match / total) * 100) : 0, total)
      for (const cls of colorClass.split(' ')) {
        if (cls) cell.classList.add(cls)
      }

      if (!hasStats) {
        if (total === 0) {
          pctEl.textContent = '—'
          metaEl.textContent = 'No data'
        } else {
          pctEl.textContent = `${total}`
          metaEl.textContent = `pull${total === 1 ? '' : 's'}`
        }
      } else {
        const pct = total > 0 ? Math.round((match / total) * 100) : 0
        if (total === 0) {
          pctEl.textContent = '—'
          metaEl.textContent = 'No data'
        } else {
          pctEl.textContent = `${pct}%`
          metaEl.textContent = `${match}/${total}`
        }
      }
    }

    updateSelection()

    if (allPulls.length === 0) {
      statusText.textContent = 'No data loaded yet'
    } else {
      const filteredCount = allPulls.filter(matchesHourFilter).length
      const dateLabel = DATE_FILTER_OPTIONS.find(d => d.value === dateFilter)?.label ?? 'All'
      const serverLabel = SERVER_FILTER_OPTIONS.find(s => s.value === serverFilter)?.label ?? 'All'
      if (hasStats) {
        const statNames = Array.from(selectedStats).map(s => STAT_LABELS[s]).join(' + ')
        statusText.textContent = `[Console] ${serverLabel} • ${dateLabel} • ${statNames} rate • ${filteredCount} pulls`
      } else {
        statusText.textContent = `[Console] ${serverLabel} • ${dateLabel} • Volume • ${filteredCount} pulls in window`
      }
    }
  }

  async function load(force = false) {
    try {
      allPulls = await fetchAllConsolePulls(dateFilter, serverFilter, 2000, force)
      render()
    } catch (err) {
      const msg = normalizeError(err)
      statusText.textContent = `Error: ${msg}`
      statusText.classList.add('text-red')
    }
  }

  load()
  refreshTimer = window.setInterval(() => load(), 180000)

  return {
    refresh: () => load(true),
    clearTimer: () => {
      if (refreshTimer) {
        clearInterval(refreshTimer)
        refreshTimer = null
      }
    },
  }
}
