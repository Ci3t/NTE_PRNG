import { type ConsolePullRow, type SecondOption, type StatKey, type ServerRegion, STAT_LABELS, HIGH_VALUE_STATS, SERVER_FILTER_OPTIONS } from '../types.ts'
import { getUserTag, getServerRegion } from '../session.ts'
import { fetchRecentConsolePulls, normalizeError } from '../db.ts'

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return `${seconds}s ago`
}

function formatDateTimeLabel(row: ConsolePullRow): string {
  const rawDate = row.logged_client_at || row.created_at
  const date = new Date(rawDate)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)

  let datePrefix = ''
  if (date < startOfYesterday) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
    if (date >= startOfWeek) {
      datePrefix = `${days[date.getDay()]} `
    } else {
      datePrefix = `${date.getMonth() + 1}/${date.getDate()} `
    }
  } else if (date < startOfToday) {
    datePrefix = 'Yesterday '
  } else {
    datePrefix = 'Today '
  }

  const h = row.pull_hour.toString().padStart(2, '0')
  const m = row.pull_minute.toString().padStart(2, '0')
  const s = row.pull_second.toString().padStart(2, '0')
  return `${datePrefix}${h}:${m}:${s} • ${timeAgo(row.created_at)}`
}

export interface ConsoleFeedCallbacks {
  // none needed for now
}

export function mountConsoleFeed(container: HTMLElement, _callbacks: ConsoleFeedCallbacks) {
  let pulls: ConsolePullRow[] = []
  let secondFilter: SecondOption | null = null
  let myPullsOnly = false
  let serverFilter: ServerRegion | 'all' = getServerRegion()
  const myTag = getUserTag()

  const wrap = document.createElement('div')
  wrap.className = 'flex flex-col flex-1 min-h-0 bg-surface/90 backdrop-blur-xl border border-border-subtle rounded-lg p-4 shadow-lg'

  const header = document.createElement('div')
  header.className = 'flex items-center justify-between gap-2 mb-2'

  const heading = document.createElement('div')
  heading.className = 'font-extrabold text-[0.65rem] tracking-widest uppercase text-text-muted'
  heading.textContent = 'Console Recent'
  header.appendChild(heading)

  const toggleLabel = document.createElement('label')
  toggleLabel.className = 'flex items-center gap-1.5 text-xs text-text-muted cursor-pointer select-none font-semibold'
  const toggleCheckbox = document.createElement('input')
  toggleCheckbox.type = 'checkbox'
  toggleCheckbox.className = 'appearance-none w-7 h-4 rounded-full bg-border relative cursor-pointer transition-colors before:content-[\'\'] before:absolute before:top-0.5 before:left-0.5 before:w-3 before:h-3 before:rounded-full before:bg-text-dim before:transition-all checked:bg-green-dim checked:before:translate-x-3 checked:before:bg-green'
  toggleLabel.appendChild(toggleCheckbox)
  toggleLabel.appendChild(document.createTextNode('Mine'))
  toggleCheckbox.addEventListener('change', () => {
    myPullsOnly = toggleCheckbox.checked
    renderList()
  })
  header.appendChild(toggleLabel)

  wrap.appendChild(header)

  // Server filter row
  const serverFilterRow = document.createElement('div')
  serverFilterRow.className = 'flex items-center gap-1.5 flex-wrap mb-2'

  const serverFilterLabel = document.createElement('span')
  serverFilterLabel.className = 'text-[0.65rem] font-bold text-text-muted uppercase tracking-wider whitespace-nowrap'
  serverFilterLabel.textContent = 'Srv'
  serverFilterRow.appendChild(serverFilterLabel)

  const serverButtons = new Map<string, HTMLButtonElement>()
  for (const opt of SERVER_FILTER_OPTIONS) {
    const btn = document.createElement('button')
    btn.className = 'bg-surface-raised border border-border rounded px-1.5 py-0.5 text-[0.65rem] font-bold text-text-muted cursor-pointer transition-all hover:bg-border hover:text-text'
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

  const list = document.createElement('div')
  list.className = 'flex flex-col gap-2 flex-1 overflow-y-auto pr-1 scrollbar-thin'
  wrap.appendChild(list)

  container.appendChild(wrap)

  function clearList() {
    while (list.firstChild) {
      list.removeChild(list.firstChild)
    }
  }

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

  refreshServerButtons()

  function statPillClass(key: StatKey): string {
    if (key === 'has_crit_rate' || key === 'has_crit_dmg') return 'bg-gold/10 text-gold-bright border-gold-dim'
    if (HIGH_VALUE_STATS.includes(key)) return 'bg-purple/10 text-purple-bright border-purple-dim'
    return 'bg-green/10 text-green border-green-dim'
  }

  function renderList() {
    clearList()

    let filtered = pulls.filter((p) => {
      if (secondFilter !== null && p.pull_second !== secondFilter) return false
      return true
    })

    if (myPullsOnly) {
      if (!myTag) {
        const empty = document.createElement('div')
        empty.className = 'text-center text-text-dim py-5 px-3 text-sm'
        empty.textContent = 'Enter your tag in the Log Form to use Mine filter'
        list.appendChild(empty)
        return
      }
      filtered = filtered.filter((p) => p.user_tag === myTag)
    }

    if (filtered.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'text-center text-text-dim py-5 px-3 text-sm'
      empty.textContent = 'No pulls match filter'
      list.appendChild(empty)
      return
    }

    for (const row of filtered) {
      const item = document.createElement('div')
      item.className = 'bg-surface-raised border border-border-subtle rounded-md p-2.5 flex flex-col gap-1 transition-all hover:border-border hover:translate-x-0.5'
      if (row.is_dual_crit) {
        item.classList.add('border-gold-dim', 'shadow-[inset_0_0_12px_rgba(245,158,11,0.05)]')
      }

      const top = document.createElement('div')
      top.className = 'flex items-center justify-between gap-2'

      const user = document.createElement('div')
      user.className = 'font-extrabold text-sm text-text'
      user.textContent = row.user_tag

      const time = document.createElement('div')
      time.className = 'tabular-nums text-xs text-text-muted font-semibold'
      time.textContent = formatDateTimeLabel(row)

      top.appendChild(user)
      top.appendChild(time)
      item.appendChild(top)

      const meta = document.createElement('div')
      meta.className = 'flex items-center gap-1.5 flex-wrap'

      // Stamina indicator
      const staminaPill = document.createElement('span')
      staminaPill.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-bold border border-transparent bg-gold/10 text-gold-bright'
      staminaPill.textContent = 'Stamina'
      meta.appendChild(staminaPill)

      if (row.server_region) {
        const serverPill = document.createElement('span')
        const serverColor = row.server_region === 'EU' ? 'bg-blue-500/10 text-blue-300' :
                            row.server_region === 'NA' ? 'bg-red-500/10 text-red-300' :
                            'bg-orange-500/10 text-orange-300'
        serverPill.className = `inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-bold border border-transparent ${serverColor}`
        serverPill.textContent = row.server_region
        meta.appendChild(serverPill)
      }

      const sourcePill = document.createElement('span')
      const sourceClass = row.time_source === 'auto' ? 'bg-blue-500/10 text-blue-300' : 'bg-gold/10 text-gold-bright'
      sourcePill.className = `inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-bold border border-transparent ${sourceClass}`
      sourcePill.textContent = row.time_source
      meta.appendChild(sourcePill)

      if (row.team_label) {
        const teamPill = document.createElement('span')
        teamPill.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-bold bg-border text-text-muted border border-transparent'
        teamPill.textContent = row.team_label
        meta.appendChild(teamPill)
      }

      const keys = Object.keys(STAT_LABELS) as StatKey[]
      for (const key of keys) {
        if ((row as unknown as Record<string, boolean>)[key]) {
          const pill = document.createElement('span')
          pill.className = `inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-bold border ${statPillClass(key)}`
          pill.textContent = STAT_LABELS[key]
          meta.appendChild(pill)
        }
      }

      item.appendChild(meta)

      if (row.notes) {
        const notes = document.createElement('div')
        notes.className = 'text-xs text-text-dim leading-relaxed'
        notes.textContent = row.notes
        item.appendChild(notes)
      }

      list.appendChild(item)
    }
  }

  async function load(force = false) {
    try {
      pulls = await fetchRecentConsolePulls(serverFilter, 25, force)
      renderList()
    } catch (err) {
      clearList()
      const empty = document.createElement('div')
      empty.className = 'text-center text-text-dim py-5 px-3 text-sm'
      empty.textContent = `Failed: ${normalizeError(err)}`
      list.appendChild(empty)
    }
  }

  load()

  return {
    refresh: () => load(true),
    setSecondFilter: (sec: SecondOption | null) => {
      secondFilter = sec
      renderList()
    },
  }
}
