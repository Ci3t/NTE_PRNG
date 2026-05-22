import { type PullRow, type SecondOption, type StatKey, STAT_LABELS, HIGH_VALUE_STATS } from '../types.ts'
import { getSessionId } from '../session.ts'
import { fetchRecentPulls, normalizeError } from '../db.ts'

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

function formatDateTimeLabel(row: PullRow): string {
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

export interface FeedCallbacks {
  // none needed for now
}

export function mountFeed(container: HTMLElement, _callbacks: FeedCallbacks) {
  let pulls: PullRow[] = []
  let secondFilter: SecondOption | null = null
  let myPullsOnly = false
  const mySession = getSessionId()

  const wrap = document.createElement('div')
  wrap.className = 'surface'
  wrap.style.flex = '1'
  wrap.style.minHeight = '0'
  wrap.style.display = 'flex'
  wrap.style.flexDirection = 'column'

  const header = document.createElement('div')
  header.className = 'feed-header'

  const heading = document.createElement('div')
  heading.className = 'heading'
  heading.textContent = 'Recent'
  header.appendChild(heading)

  const toggleLabel = document.createElement('label')
  toggleLabel.className = 'feed-toggle'
  const toggleCheckbox = document.createElement('input')
  toggleCheckbox.type = 'checkbox'
  toggleLabel.appendChild(toggleCheckbox)
  toggleLabel.appendChild(document.createTextNode('Mine'))
  toggleCheckbox.addEventListener('change', () => {
    myPullsOnly = toggleCheckbox.checked
    renderList()
  })
  header.appendChild(toggleLabel)

  wrap.appendChild(header)

  const list = document.createElement('div')
  list.className = 'feed-list panel-scroll'
  wrap.appendChild(list)

  container.appendChild(wrap)

  function statPillClass(key: StatKey): string {
    if (key === 'has_crit_rate' || key === 'has_crit_dmg') return 'is-dual-crit'
    if (HIGH_VALUE_STATS.includes(key)) return 'is-high'
    return 'is-stat'
  }

  function renderList() {
    list.innerHTML = ''

    const filtered = pulls.filter((p) => {
      if (secondFilter !== null && p.pull_second !== secondFilter) return false
      if (myPullsOnly && p.session_id !== mySession) return false
      return true
    })

    if (filtered.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'empty-state'
      empty.textContent = 'No pulls match filter'
      list.appendChild(empty)
      return
    }

    for (const row of filtered) {
      const item = document.createElement('div')
      item.className = 'feed-item'
      if (row.is_dual_crit) {
        item.classList.add('is-dual-crit')
      }

      const top = document.createElement('div')
      top.className = 'feed-item-header'

      const user = document.createElement('div')
      user.className = 'feed-user'
      user.textContent = row.user_tag

      const time = document.createElement('div')
      time.className = 'feed-time'
      time.textContent = formatDateTimeLabel(row)

      top.appendChild(user)
      top.appendChild(time)
      item.appendChild(top)

      const meta = document.createElement('div')
      meta.className = 'feed-meta'

      const sourcePill = document.createElement('span')
      sourcePill.className = `feed-pill ${row.time_source === 'auto' ? 'is-time-auto' : 'is-time-manual'}`
      sourcePill.textContent = row.time_source
      meta.appendChild(sourcePill)

      if (row.team_label) {
        const teamPill = document.createElement('span')
        teamPill.className = 'feed-pill'
        teamPill.textContent = row.team_label
        meta.appendChild(teamPill)
      }

      const keys = Object.keys(STAT_LABELS) as StatKey[]
      for (const key of keys) {
        if ((row as unknown as Record<string, boolean>)[key]) {
          const pill = document.createElement('span')
          pill.className = `feed-pill ${statPillClass(key)}`
          pill.textContent = STAT_LABELS[key]
          meta.appendChild(pill)
        }
      }

      item.appendChild(meta)

      if (row.notes) {
        const notes = document.createElement('div')
        notes.className = 'feed-notes'
        notes.textContent = row.notes
        item.appendChild(notes)
      }

      list.appendChild(item)
    }
  }

  async function load(force = false) {
    try {
      pulls = await fetchRecentPulls(25, force)
      renderList()
    } catch (err) {
      list.innerHTML = ''
      const empty = document.createElement('div')
      empty.className = 'empty-state'
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
