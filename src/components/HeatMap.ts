import { type StatKey, type SecondOption, SECOND_OPTIONS, STAT_LABELS } from '../types.ts'
import { fetchAllPulls, normalizeError } from '../db.ts'
import type { PullRow } from '../types.ts'

export interface HeatMapCallbacks {
  onSecondSelected: (second: SecondOption | null) => void
}

export function mountHeatMap(container: HTMLElement, callbacks: HeatMapCallbacks) {
  let selectedSecond: SecondOption | null = null
  let selectedStats = new Set<StatKey>()
  let hourFilter: 'all' | 'current' | -1 | -2 = 'all'
  let allPulls: PullRow[] = []
  let refreshTimer: number | null = null

  const wrap = document.createElement('div')
  wrap.className = 'surface'
  wrap.style.display = 'flex'
  wrap.style.flexDirection = 'column'

  // Header
  const header = document.createElement('div')
  header.className = 'heading'
  header.textContent = 'Heatmap'

  const refreshBtn = document.createElement('button')
  refreshBtn.className = 'btn btn-ghost'
  refreshBtn.type = 'button'
  refreshBtn.textContent = 'Refresh'
  refreshBtn.addEventListener('click', () => load())
  header.appendChild(refreshBtn)
  wrap.appendChild(header)

  // Stat filter (compact horizontal)
  const statFilterRow = document.createElement('div')
  statFilterRow.className = 'filter-row'

  const statFilterLabel = document.createElement('span')
  statFilterLabel.className = 'filter-label'
  statFilterLabel.textContent = 'Stats'
  statFilterRow.appendChild(statFilterLabel)

  const statFilterButtons = new Map<StatKey, HTMLButtonElement>()
  const statKeys = Object.keys(STAT_LABELS) as StatKey[]
  for (const key of statKeys) {
    const btn = document.createElement('button')
    btn.className = 'btn btn-stat'
    btn.type = 'button'
    btn.textContent = STAT_LABELS[key]
    btn.style.padding = '0.25rem 0.4rem'
    btn.style.fontSize = '0.65rem'
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
  hourFilterRow.className = 'filter-row'

  const hourFilterLabel = document.createElement('span')
  hourFilterLabel.className = 'filter-label'
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
    btn.className = 'btn btn-second'
    btn.type = 'button'
    btn.textContent = opt.label
    btn.style.padding = '0.25rem 0.4rem'
    btn.style.fontSize = '0.7rem'
    btn.addEventListener('click', () => {
      hourFilter = opt.value
      refreshHourButtons()
      render()
    })
    hourButtons.set(String(opt.value), btn)
    hourFilterRow.appendChild(btn)
  }

  const clearBtn = document.createElement('button')
  clearBtn.className = 'btn btn-ghost'
  clearBtn.type = 'button'
  clearBtn.textContent = 'Clear'
  clearBtn.addEventListener('click', () => {
    selectedStats.clear()
    refreshStatFilterButtons()
    render()
  })
  hourFilterRow.appendChild(clearBtn)
  wrap.appendChild(hourFilterRow)

  // Status
  const statusText = document.createElement('div')
  statusText.className = 'status-bar'
  wrap.appendChild(statusText)

  // Grid
  const grid = document.createElement('div')
  grid.className = 'heatmap-grid'
  wrap.appendChild(grid)

  container.appendChild(wrap)

  const cellMap = new Map<SecondOption, HTMLButtonElement>()

  for (const sec of SECOND_OPTIONS) {
    const cell = document.createElement('button')
    cell.className = 'heatmap-cell'
    cell.type = 'button'

    const label = document.createElement('div')
    label.className = 'sec-label'
    label.textContent = `:${sec.toString().padStart(2, '0')}`

    const pct = document.createElement('div')
    pct.className = 'sec-pct'

    const meta = document.createElement('div')
    meta.className = 'sec-meta'

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

  refreshHourButtons()

  function refreshStatFilterButtons() {
    for (const [key, btn] of statFilterButtons.entries()) {
      btn.classList.toggle('is-active', selectedStats.has(key))
    }
  }

  function refreshHourButtons() {
    for (const [value, btn] of hourButtons.entries()) {
      btn.classList.toggle('is-active', String(hourFilter) === value)
    }
  }

  function updateSelection() {
    for (const [sec, cell] of cellMap.entries()) {
      cell.classList.toggle('is-selected', sec === selectedSecond)
    }
  }

  function getCurrentHour(): number {
    return new Date().getHours()
  }

  function matchesHourFilter(row: PullRow): boolean {
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
    if (total === 0) return 'hm-empty'
    if (total <= 5) return 'hm-low'
    if (total <= 20) return 'hm-mid'
    if (total <= 50) return 'hm-high'
    return 'hm-gold'
  }

  function colorClassWithStats(pct: number, total: number): string {
    if (total === 0) return 'hm-empty'
    if (pct === 0) return 'hm-empty'
    if (pct <= 15) return 'hm-low'
    if (pct <= 30) return 'hm-mid'
    if (pct <= 50) return 'hm-high'
    return 'hm-gold'
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

      cell.classList.remove('hm-empty', 'hm-low', 'hm-mid', 'hm-high', 'hm-gold')

      if (!hasStats) {
        cell.classList.add(colorClassNoStats(total))
        if (total === 0) {
          pctEl.textContent = '—'
          metaEl.textContent = 'No data'
        } else {
          pctEl.textContent = `${total}`
          metaEl.textContent = `pull${total === 1 ? '' : 's'}`
        }
      } else {
        const pct = total > 0 ? Math.round((match / total) * 100) : 0
        cell.classList.add(colorClassWithStats(pct, total))
        if (total === 0) {
          pctEl.textContent = '—'
          metaEl.textContent = 'No data'
        } else {
          pctEl.textContent = `${pct}%`
          metaEl.textContent = `${match}/${total}`
        }
      }
    }

    if (allPulls.length === 0) {
      statusText.textContent = 'No data loaded yet'
    } else {
      const filteredCount = allPulls.filter(matchesHourFilter).length
      if (hasStats) {
        const statNames = Array.from(selectedStats).map(s => STAT_LABELS[s]).join(' + ')
        statusText.textContent = `${statNames} rate • ${filteredCount} pulls`
      } else {
        statusText.textContent = `Volume • ${filteredCount} pulls in window`
      }
    }
  }

  async function load() {
    try {
      allPulls = await fetchAllPulls(2000)
      render()
    } catch (err) {
      const msg = normalizeError(err)
      statusText.textContent = `Error: ${msg}`
      statusText.style.color = 'var(--red)'
    }
  }

  load()
  refreshTimer = window.setInterval(load, 180000)

  return {
    refresh: load,
    clearTimer: () => {
      if (refreshTimer) {
        clearInterval(refreshTimer)
        refreshTimer = null
      }
    },
  }
}
