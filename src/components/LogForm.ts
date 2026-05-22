import {
  type PullInsertPayload,
  type StatKey,
  type SecondOption,
  type ServerRegion,
  SECOND_OPTIONS,
  STAT_LABELS,
  SERVER_OPTIONS,
} from '../types.ts'
import { getUserTag, setUserTag, getSessionId, getServerRegion, setServerRegion } from '../session.ts'
import { insertPull, normalizeError } from '../db.ts'

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

function pad2ms(n: number): string {
  return Math.floor(n / 10).toString().padStart(2, '0')
}

function getNowParts(): {
  hour: number
  minute: number
  second: SecondOption
  clientAt: string
  offset: number
} {
  const now = new Date()
  const rawSec = now.getSeconds()
  const roundedSec = SECOND_OPTIONS.reduce((prev, curr) =>
    Math.abs(curr - rawSec) < Math.abs(prev - rawSec) ? curr : prev
  ) as SecondOption

  return {
    hour: now.getHours(),
    minute: now.getMinutes(),
    second: roundedSec,
    clientAt: now.toISOString(),
    offset: -now.getTimezoneOffset(),
  }
}

function formatDateLabel(): string {
  const now = new Date()
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[now.getDay()]} ${months[now.getMonth()]} ${now.getDate()}`
}

export interface LogFormCallbacks {
  onSubmitted: () => void
}

export function mountLogForm(container: HTMLElement, callbacks: LogFormCallbacks) {
  let liveMode = true

  const state = {
    hour: 0,
    minute: 0,
    second: 0 as SecondOption,
    timeSource: 'auto' as 'auto' | 'manual',
    stats: new Set<StatKey>(),
    clientAt: '',
    offset: 0,
  }

  function setTimeFromNow() {
    const now = getNowParts()
    state.hour = now.hour
    state.minute = now.minute
    state.second = now.second
    state.clientAt = now.clientAt
    state.offset = now.offset
    state.timeSource = 'auto'
    liveMode = true
    refreshTimeDisplay()
    refreshInputs()
    refreshSecondButtons()
  }

  function markManual() {
    if (state.timeSource === 'auto') {
      state.timeSource = 'manual'
    }
    liveMode = false
  }

  // --- Surface card ---
  const formEl = document.createElement('div')
  formEl.className = 'flex flex-col gap-2.5 bg-surface/90 backdrop-blur-xl border border-border-subtle rounded-lg p-4 shadow-lg justify-center flex-1 min-h-0 overflow-y-auto scrollbar-thin'

  // Heading
  const heading = document.createElement('div')
  heading.className = 'font-extrabold text-[0.65rem] tracking-widest uppercase text-text-muted mb-1 flex items-center justify-between'
  heading.textContent = 'Log Pull'
  formEl.appendChild(heading)

  // Date display
  const dateDisplay = document.createElement('div')
  dateDisplay.className = 'text-xs font-bold text-text-muted text-center tracking-wider uppercase'
  dateDisplay.textContent = formatDateLabel()
  formEl.appendChild(dateDisplay)

  // User tag
  const tagInput = document.createElement('input')
  tagInput.className = 'appearance-none bg-surface-raised border border-border rounded text-text px-3 py-2 text-sm w-full transition-all placeholder:text-text-dim focus:outline-none focus:border-purple focus:ring-2 focus:ring-purple/15'
  tagInput.type = 'text'
  tagInput.maxLength = 32
  tagInput.placeholder = 'Your tag'
  tagInput.value = getUserTag()
  tagInput.addEventListener('input', () => {
    setUserTag(tagInput.value)
    clearError()
  })
  formEl.appendChild(tagInput)

  // Server select
  const serverSelect = document.createElement('select')
  serverSelect.className = 'appearance-none bg-surface-raised border border-border rounded text-text px-3 py-2 text-sm w-full transition-all focus:outline-none focus:border-purple focus:ring-2 focus:ring-purple/15 cursor-pointer'
  for (const srv of SERVER_OPTIONS) {
    const opt = document.createElement('option')
    opt.value = srv
    opt.textContent = `Server: ${srv}`
    serverSelect.appendChild(opt)
  }
  serverSelect.value = getServerRegion()
  serverSelect.addEventListener('change', () => {
    setServerRegion(serverSelect.value as ServerRegion)
  })
  formEl.appendChild(serverSelect)

  // Time display
  const timeDisplay = document.createElement('div')
  timeDisplay.className = 'tabular-nums font-extrabold text-2xl tracking-wide text-text text-center py-2 bg-surface-raised rounded border border-border font-[var(--font-mono)] shadow-inner'
  formEl.appendChild(timeDisplay)

  // Time controls row
  const timeRow = document.createElement('div')
  timeRow.className = 'flex gap-2 items-center'

  const hourInput = createNumberInput(0, 23, 'HH')
  const minuteInput = createNumberInput(0, 59, 'MM')
  const nowBtn = document.createElement('button')
  nowBtn.className = 'bg-gradient-to-br from-purple to-purple-dim text-white border-transparent rounded px-3 py-1.5 text-xs font-bold cursor-pointer transition-all hover:from-purple-bright hover:to-purple hover:-translate-y-0.5 shadow-lg shadow-purple/15'
  nowBtn.type = 'button'
  nowBtn.textContent = 'Now'
  nowBtn.addEventListener('click', () => {
    setTimeFromNow()
    clearError()
  })

  hourInput.addEventListener('change', () => {
    state.hour = clamp(parseInt(hourInput.value, 10) || 0, 0, 23)
    markManual()
    refreshTimeDisplay()
    clearError()
  })
  minuteInput.addEventListener('change', () => {
    state.minute = clamp(parseInt(minuteInput.value, 10) || 0, 0, 59)
    markManual()
    refreshTimeDisplay()
    clearError()
  })

  timeRow.appendChild(hourInput)
  timeRow.appendChild(minuteInput)
  timeRow.appendChild(nowBtn)
  formEl.appendChild(timeRow)

  // Second quick-pick grid
  const secondsGrid = document.createElement('div')
  secondsGrid.className = 'grid grid-cols-6 gap-1.5'
  const secondButtons: HTMLButtonElement[] = []

  for (const sec of SECOND_OPTIONS) {
    const btn = document.createElement('button')
    btn.className = 'bg-surface-raised border border-border rounded py-2 text-xs font-bold text-text-muted cursor-pointer transition-all hover:bg-border hover:text-text hover:-translate-y-px tabular-nums'
    btn.type = 'button'
    btn.textContent = `:${pad2(sec)}`
    btn.addEventListener('click', () => {
      state.second = sec
      markManual()
      refreshSecondButtons()
      refreshTimeDisplay()
      clearError()
    })
    secondButtons.push(btn)
    secondsGrid.appendChild(btn)
  }
  formEl.appendChild(secondsGrid)

  // Team label
  const teamInput = document.createElement('input')
  teamInput.className = 'appearance-none bg-surface-raised border border-border rounded text-text px-3 py-2 text-sm w-full transition-all placeholder:text-text-dim focus:outline-none focus:border-purple focus:ring-2 focus:ring-purple/15'
  teamInput.type = 'text'
  teamInput.maxLength = 80
  teamInput.placeholder = 'Team / Character'
  formEl.appendChild(teamInput)

  // Stat toggles
  const statsGrid = document.createElement('div')
  statsGrid.className = 'grid grid-cols-3 gap-1.5'
  const statButtons = new Map<StatKey, HTMLButtonElement>()

  const statKeys = Object.keys(STAT_LABELS) as StatKey[]
  for (const key of statKeys) {
    const btn = document.createElement('button')
    btn.className = 'bg-surface-raised border border-border rounded py-1.5 text-xs font-bold text-text-muted cursor-pointer transition-all hover:bg-border hover:text-text hover:-translate-y-px'
    btn.type = 'button'
    btn.textContent = STAT_LABELS[key]
    btn.addEventListener('click', () => {
      if (state.stats.has(key)) {
        state.stats.delete(key)
      } else {
        state.stats.add(key)
      }
      refreshStatButtons()
      clearError()
    })
    statButtons.set(key, btn)
    statsGrid.appendChild(btn)
  }
  formEl.appendChild(statsGrid)

  // Notes
  const notesInput = document.createElement('input')
  notesInput.className = 'appearance-none bg-surface-raised border border-border rounded text-text px-3 py-2 text-sm w-full transition-all placeholder:text-text-dim focus:outline-none focus:border-purple focus:ring-2 focus:ring-purple/15'
  notesInput.type = 'text'
  notesInput.maxLength = 300
  notesInput.placeholder = 'Notes...'
  formEl.appendChild(notesInput)

  // Submit area
  const submitArea = document.createElement('div')
  submitArea.className = 'flex flex-col gap-2 mt-1'

  const errorEl = document.createElement('div')
  errorEl.className = 'text-sm text-red font-medium min-h-[1.1rem]'
  submitArea.appendChild(errorEl)

  const submitBtn = document.createElement('button')
  submitBtn.className = 'w-full bg-gradient-to-br from-purple to-purple-dim text-white border-transparent rounded py-3 text-sm font-bold cursor-pointer transition-all hover:from-purple-bright hover:to-purple hover:-translate-y-0.5 shadow-lg shadow-purple/15'
  submitBtn.type = 'button'
  submitBtn.textContent = 'Log Pull'
  submitBtn.addEventListener('click', handleSubmit)
  submitArea.appendChild(submitBtn)

  const successEl = document.createElement('div')
  successEl.className = 'text-center text-green font-bold text-sm hidden'
  successEl.textContent = 'Logged!'
  submitArea.appendChild(successEl)

  formEl.appendChild(submitArea)

  // Tip card
  const tipCard = document.createElement('div')
  tipCard.className = 'bg-surface-raised border border-border rounded p-3 mt-1'

  const tipTitle = document.createElement('div')
  tipTitle.className = 'text-xs font-extrabold text-gold-bright uppercase tracking-wider mb-1'
  tipTitle.textContent = 'How to Find Your Zone'
  tipCard.appendChild(tipTitle)

  const tipBody = document.createElement('div')
  tipBody.className = 'text-xs text-text-muted leading-relaxed'
  tipBody.appendChild(document.createTextNode('Run '))
  const b1 = document.createElement('b')
  b1.className = 'text-text font-bold'
  b1.textContent = 'Easy / Normal'
  tipBody.appendChild(b1)
  tipBody.appendChild(document.createTextNode(' mode and pull at the same '))
  const b2 = document.createElement('b')
  b2.className = 'text-text font-bold'
  b2.textContent = ':SS'
  tipBody.appendChild(b2)
  tipBody.appendChild(document.createTextNode(' window repeatedly. Note where '))
  const b3 = document.createElement('b')
  b3.className = 'text-text font-bold'
  b3.textContent = 'CRIT Rate'
  tipBody.appendChild(b3)
  tipBody.appendChild(document.createTextNode(' + '))
  const b4 = document.createElement('b')
  b4.className = 'text-text font-bold'
  b4.textContent = 'CRIT DMG'
  tipBody.appendChild(b4)
  tipBody.appendChild(document.createTextNode(' land — that\'s your hot zone. Test each hour separately; RNG windows shift hourly.'))
  tipCard.appendChild(tipBody)

  formEl.appendChild(tipCard)

  formEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault()
      handleSubmit()
    }
  })

  container.appendChild(formEl)

  setTimeFromNow()

  // Live clock tick
  window.setInterval(refreshTimeDisplay, 50)

  // Helpers
  function createNumberInput(min: number, max: number, placeholder: string): HTMLInputElement {
    const input = document.createElement('input')
    input.className = 'flex-1 text-center bg-surface-raised border border-border rounded text-text px-2 py-1.5 text-sm transition-all placeholder:text-text-dim focus:outline-none focus:border-purple focus:ring-2 focus:ring-purple/15'
    input.type = 'number'
    input.min = String(min)
    input.max = String(max)
    input.placeholder = placeholder
    input.inputMode = 'numeric'
    return input
  }

  function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n))
  }

  function refreshTimeDisplay() {
    if (liveMode) {
      const now = new Date()
      timeDisplay.textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}.${pad2ms(now.getMilliseconds())}`
    } else {
      timeDisplay.textContent = `${pad2(state.hour)}:${pad2(state.minute)}:${pad2(state.second)}`
    }
  }

  function refreshInputs() {
    hourInput.value = pad2(state.hour)
    minuteInput.value = pad2(state.minute)
  }

  function refreshSecondButtons() {
    for (const [idx, btn] of secondButtons.entries()) {
      const sec = SECOND_OPTIONS[idx]
      const active = sec === state.second
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

  function refreshStatButtons() {
    for (const [key, btn] of statButtons.entries()) {
      const active = state.stats.has(key)
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

  function clearError() {
    errorEl.textContent = ''
    tagInput.classList.remove('border-red')
  }

  function showError(msg: string) {
    errorEl.textContent = msg
    if (msg.toLowerCase().includes('tag')) {
      tagInput.classList.add('border-red')
    }
  }

  function clearSuccess() {
    successEl.classList.add('hidden')
  }

  function showSuccess() {
    successEl.classList.remove('hidden')
    setTimeout(() => {
      clearSuccess()
    }, 2000)
  }

  async function handleSubmit() {
    clearError()
    clearSuccess()

    const userTag = tagInput.value.trim()
    if (!userTag || userTag.length > 32) {
      showError('Tag required (max 32 chars)')
      return
    }

    if (state.stats.size === 0) {
      showError('Select at least one substat')
      return
    }

    const payload: PullInsertPayload = {
      user_tag: userTag,
      session_id: getSessionId(),
      server_region: serverSelect.value as ServerRegion,
      pull_hour: state.hour,
      pull_minute: state.minute,
      pull_second: state.second,
      time_source: state.timeSource,
      logged_client_at: state.clientAt || new Date().toISOString(),
      timezone_offset_minutes: state.offset,
      team_label: teamInput.value.trim() || undefined,
      notes: notesInput.value.trim() || undefined,
      has_flat_hp: state.stats.has('has_flat_hp'),
      has_flat_atk: state.stats.has('has_flat_atk'),
      has_flat_def: state.stats.has('has_flat_def'),
      has_hp_pct: state.stats.has('has_hp_pct'),
      has_atk_pct: state.stats.has('has_atk_pct'),
      has_def_pct: state.stats.has('has_def_pct'),
      has_dmg_pct: state.stats.has('has_dmg_pct'),
      has_crit_rate: state.stats.has('has_crit_rate'),
      has_crit_dmg: state.stats.has('has_crit_dmg'),
      has_break_intensity: state.stats.has('has_break_intensity'),
      has_cycle_intensity: state.stats.has('has_cycle_intensity'),
    }

    try {
      await insertPull(payload)
      state.stats.clear()
      refreshStatButtons()
      notesInput.value = ''
      showSuccess()
      callbacks.onSubmitted()
      setTimeFromNow()
    } catch (err) {
      showError(normalizeError(err))
    }
  }
}
