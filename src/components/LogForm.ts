import {
  type PullInsertPayload,
  type StatKey,
  type SecondOption,
  SECOND_OPTIONS,
  STAT_LABELS,
} from '../types.ts'
import { getUserTag, setUserTag, getSessionId } from '../session.ts'
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

  const formEl = document.createElement('div')
  formEl.className = 'surface form-section'

  const heading = document.createElement('div')
  heading.className = 'heading'
  heading.textContent = 'Log Pull'
  formEl.appendChild(heading)

  // Date display
  const dateDisplay = document.createElement('div')
  dateDisplay.className = 'date-display'
  dateDisplay.textContent = formatDateLabel()
  formEl.appendChild(dateDisplay)

  // User tag
  const tagInput = document.createElement('input')
  tagInput.className = 'form-input'
  tagInput.type = 'text'
  tagInput.maxLength = 32
  tagInput.placeholder = 'Your tag'
  tagInput.value = getUserTag()
  tagInput.addEventListener('input', () => {
    setUserTag(tagInput.value)
    clearError()
  })
  formEl.appendChild(tagInput)

  // Time display
  const timeDisplay = document.createElement('div')
  timeDisplay.className = 'time-display'
  formEl.appendChild(timeDisplay)

  // Time controls row
  const timeRow = document.createElement('div')
  timeRow.className = 'time-row'

  const hourInput = createNumberInput(0, 23, 'HH')
  const minuteInput = createNumberInput(0, 59, 'MM')
  const nowBtn = document.createElement('button')
  nowBtn.className = 'btn btn-primary'
  nowBtn.type = 'button'
  nowBtn.style.padding = '0.4rem 0.6rem'
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

  // Second quick-pick grid (single row)
  const secondsGrid = document.createElement('div')
  secondsGrid.className = 'seconds-grid'
  const secondButtons: HTMLButtonElement[] = []

  for (const sec of SECOND_OPTIONS) {
    const btn = document.createElement('button')
    btn.className = 'btn btn-second'
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

  // Team label (compact, no label text)
  const teamInput = document.createElement('input')
  teamInput.className = 'form-input'
  teamInput.type = 'text'
  teamInput.maxLength = 80
  teamInput.placeholder = 'Team / Character'
  formEl.appendChild(teamInput)

  // Stat toggles
  const statsGrid = document.createElement('div')
  statsGrid.className = 'stats-grid'
  const statButtons = new Map<StatKey, HTMLButtonElement>()

  const statKeys = Object.keys(STAT_LABELS) as StatKey[]
  for (const key of statKeys) {
    const btn = document.createElement('button')
    btn.className = 'btn btn-stat'
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

  // Notes (compact)
  const notesInput = document.createElement('input')
  notesInput.className = 'form-input'
  notesInput.type = 'text'
  notesInput.maxLength = 300
  notesInput.placeholder = 'Notes...'
  formEl.appendChild(notesInput)

  // Submit area
  const submitArea = document.createElement('div')
  submitArea.className = 'submit-area'

  const errorEl = document.createElement('div')
  errorEl.className = 'form-error'
  submitArea.appendChild(errorEl)

  const submitBtn = document.createElement('button')
  submitBtn.className = 'btn btn-primary btn-submit'
  submitBtn.type = 'button'
  submitBtn.textContent = 'Log Pull'
  submitBtn.addEventListener('click', handleSubmit)
  submitArea.appendChild(submitBtn)

  const successEl = document.createElement('div')
  successEl.className = 'success-msg'
  successEl.style.display = 'none'
  successEl.textContent = 'Logged!'
  submitArea.appendChild(successEl)

  formEl.appendChild(submitArea)

  // Testing tip card
  const tipCard = document.createElement('div')
  tipCard.className = 'tip-card'
  const tipTitle = document.createElement('div')
  tipTitle.className = 'tip-title'
  tipTitle.textContent = 'How to Find Your Zone'
  const tipBody = document.createElement('div')
  tipBody.className = 'tip-body'
  tipBody.innerHTML = `Run <b>Easy / Normal</b> mode and pull at the same <b>:SS</b> window repeatedly. Note where <b>CRIT Rate</b> + <b>CRIT DMG</b> land — that\'s your hot zone. Test each hour separately; RNG windows shift hourly.`
  tipCard.appendChild(tipTitle)
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
    input.className = 'form-input'
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
      btn.classList.toggle('is-active', sec === state.second)
    }
  }

  function refreshStatButtons() {
    for (const [key, btn] of statButtons.entries()) {
      btn.classList.toggle('is-active', state.stats.has(key))
    }
  }

  function clearError() {
    errorEl.textContent = ''
    tagInput.classList.remove('is-invalid')
  }

  function showError(msg: string) {
    errorEl.textContent = msg
    if (msg.toLowerCase().includes('tag')) {
      tagInput.classList.add('is-invalid')
    }
  }

  function clearSuccess() {
    successEl.style.display = 'none'
  }

  function showSuccess() {
    successEl.style.display = 'block'
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
