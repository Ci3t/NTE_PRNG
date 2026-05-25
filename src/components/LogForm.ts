import {
  type PullInsertPayload,
  type ConsolePullInsertPayload,
  type StatKey,
  type SecondOption,
  type ServerRegion,
  type PullMode,
  type LogMode,
  type ConsoleMainStat,
  SECOND_OPTIONS,
  STAT_LABELS,
  SERVER_OPTIONS,
  CONSOLE_MAIN_STAT_OPTIONS,
} from '../types.ts'
import { getUserTag, setUserTag, getSessionId, getServerRegion, setServerRegion, getLogMode, setLogMode } from '../session.ts'
import { insertPull, insertConsolePull, insertPullsBulk, insertConsolePullsBulk, normalizeError } from '../db.ts'

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

export interface LogFormProps {
  mode: PullMode
}

interface DropConfig {
  hour: number
  minute: number
  second: number
  stats: Set<StatKey>
  mainStat: ConsoleMainStat | null
}

export function mountLogForm(container: HTMLElement, props: LogFormProps, callbacks: LogFormCallbacks) {
  const mode = props.mode
  const isConsole = mode === 'stamina'
  let logMode: LogMode = getLogMode()
  let liveMode = true

  const state = {
    hour: 0,
    minute: 0,
    second: 0 as SecondOption,
    timeSource: 'auto' as 'auto' | 'manual',
    stats: new Set<StatKey>(),
    clientAt: '',
    offset: 0,
    mainStat: null as ConsoleMainStat | null,
    dropCount: 5,
    stackCount: 10,
    drops: [] as DropConfig[],
  }

  function initDrops(count: number) {
    const now = getNowParts()
    while (state.drops.length < count) {
      state.drops.push({
        hour: state.hour || now.hour,
        minute: state.minute || now.minute,
        second: state.second || now.second,
        stats: new Set<StatKey>(),
        mainStat: null,
      })
    }
    while (state.drops.length > count) {
      state.drops.pop()
    }
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
    // Also update bulk drop times to current
    for (const drop of state.drops) {
      drop.hour = now.hour
      drop.minute = now.minute
      drop.second = now.second
    }
    if (logMode === 'bulk') rebuildBulkDropCards()
  }

  function markManual() {
    if (state.timeSource === 'auto') {
      state.timeSource = 'manual'
    }
    liveMode = false
  }

  // ── Surface card ──
  const formEl = document.createElement('div')
  formEl.className = 'flex flex-col gap-2.5 bg-surface/90 backdrop-blur-xl border border-border-subtle rounded-lg p-4 shadow-lg justify-center flex-1 min-h-0 overflow-y-auto scrollbar-thin'

  // Heading with mode badge
  const heading = document.createElement('div')
  heading.className = 'font-extrabold text-[0.65rem] tracking-widest uppercase text-text-muted mb-1 flex items-center justify-between'

  const headingText = document.createElement('span')
  headingText.textContent = isConsole ? 'Log Console Pull' : 'Log Rewind Pull'
  heading.appendChild(headingText)

  const modeBadge = document.createElement('span')
  modeBadge.className = `text-[0.6rem] font-bold px-1.5 py-0.5 rounded border ${
    isConsole
      ? 'bg-gold/10 text-gold-bright border-gold-dim'
      : 'bg-purple/10 text-purple-bright border-purple-dim'
  }`
  modeBadge.textContent = isConsole ? 'CONSOLE' : 'REWIND'
  heading.appendChild(modeBadge)

  formEl.appendChild(heading)

  // Date display
  const dateDisplay = document.createElement('div')
  dateDisplay.className = 'text-xs font-bold text-text-muted text-center tracking-wider uppercase'
  dateDisplay.textContent = formatDateLabel()
  formEl.appendChild(dateDisplay)

  // ── Mode toggle: Single | Bulk | x10 ──
  const modeToggleRow = document.createElement('div')
  modeToggleRow.className = 'flex items-center justify-center'

  const modeToggle = document.createElement('div')
  modeToggle.className = 'flex items-center gap-1 bg-surface-raised border border-border rounded p-0.5'

  const singleBtn = document.createElement('button')
  singleBtn.className = 'px-2 py-1 text-[0.65rem] font-bold rounded transition-all'
  singleBtn.textContent = 'Single'
  singleBtn.type = 'button'

  const bulkBtn = document.createElement('button')
  bulkBtn.className = 'px-2 py-1 text-[0.65rem] font-bold rounded transition-all'
  bulkBtn.textContent = 'Bulk'
  bulkBtn.type = 'button'

  const stackBtn = document.createElement('button')
  stackBtn.className = 'px-2 py-1 text-[0.65rem] font-bold rounded transition-all'
  stackBtn.textContent = '×10'
  stackBtn.type = 'button'

  function refreshLogModeButtons() {
    const m = logMode
    singleBtn.classList.toggle('bg-purple', m === 'single')
    singleBtn.classList.toggle('text-white', m === 'single')
    singleBtn.classList.toggle('shadow-sm', m === 'single')
    singleBtn.classList.toggle('text-text-muted', m !== 'single')

    bulkBtn.classList.toggle('bg-gold', m === 'bulk')
    bulkBtn.classList.toggle('text-white', m === 'bulk')
    bulkBtn.classList.toggle('shadow-sm', m === 'bulk')
    bulkBtn.classList.toggle('text-text-muted', m !== 'bulk')

    stackBtn.classList.toggle('bg-green', m === 'stack')
    stackBtn.classList.toggle('text-white', m === 'stack')
    stackBtn.classList.toggle('shadow-sm', m === 'stack')
    stackBtn.classList.toggle('text-text-muted', m !== 'stack')
  }

  singleBtn.addEventListener('click', () => {
    if (logMode !== 'single') {
      logMode = 'single'
      setLogMode(logMode)
      refreshLogModeButtons()
      refreshModeVisibility()
    }
  })

  bulkBtn.addEventListener('click', () => {
    if (logMode !== 'bulk') {
      logMode = 'bulk'
      setLogMode(logMode)
      initDrops(state.dropCount)
      refreshLogModeButtons()
      refreshModeVisibility()
    }
  })

  stackBtn.addEventListener('click', () => {
    if (logMode !== 'stack') {
      logMode = 'stack'
      setLogMode(logMode)
      refreshLogModeButtons()
      refreshModeVisibility()
    }
  })

  modeToggle.appendChild(singleBtn)
  modeToggle.appendChild(bulkBtn)
  modeToggle.appendChild(stackBtn)
  modeToggleRow.appendChild(modeToggle)
  formEl.appendChild(modeToggleRow)

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

  // ── Shared Time Section (Single + Stack only) ──
  const timeSection = document.createElement('div')
  timeSection.className = 'flex flex-col gap-2'

  const timeDisplay = document.createElement('div')
  timeDisplay.className = 'tabular-nums font-extrabold text-2xl tracking-wide text-text text-center py-2 bg-surface-raised rounded border border-border font-[var(--font-mono)] shadow-inner'
  timeSection.appendChild(timeDisplay)

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
  timeSection.appendChild(timeRow)

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
  timeSection.appendChild(secondsGrid)

  formEl.appendChild(timeSection)

  // ── Shared Main Stat (Console, Single + Stack only) ──
  let sharedMainStatSelect: HTMLSelectElement | null = null
  const sharedMainStatWrap = document.createElement('div')
  sharedMainStatWrap.className = 'flex flex-col gap-1'
  if (isConsole) {
    const mainStatLabel = document.createElement('div')
    mainStatLabel.className = 'text-[0.65rem] font-bold text-text-muted uppercase tracking-wider'
    mainStatLabel.textContent = 'Main Stat'
    sharedMainStatWrap.appendChild(mainStatLabel)

    sharedMainStatSelect = document.createElement('select')
    sharedMainStatSelect.className = 'appearance-none bg-surface-raised border border-border rounded text-text px-3 py-2 text-sm w-full transition-all focus:outline-none focus:border-purple focus:ring-2 focus:ring-purple/15 cursor-pointer'
    const emptyOpt = document.createElement('option')
    emptyOpt.value = ''
    emptyOpt.textContent = 'Select main stat...'
    sharedMainStatSelect.appendChild(emptyOpt)
    for (const stat of CONSOLE_MAIN_STAT_OPTIONS) {
      const opt = document.createElement('option')
      opt.value = stat
      opt.textContent = stat
      sharedMainStatSelect.appendChild(opt)
    }
    sharedMainStatSelect.addEventListener('change', () => {
      state.mainStat = sharedMainStatSelect!.value as ConsoleMainStat || null
      clearError()
    })
    sharedMainStatWrap.appendChild(sharedMainStatSelect)
    formEl.appendChild(sharedMainStatWrap)
  }

  // Team label
  const teamInput = document.createElement('input')
  teamInput.className = 'appearance-none bg-surface-raised border border-border rounded text-text px-3 py-2 text-sm w-full transition-all placeholder:text-text-dim focus:outline-none focus:border-purple focus:ring-2 focus:ring-purple/15'
  teamInput.type = 'text'
  teamInput.maxLength = 80
  teamInput.placeholder = 'Team / Character'
  formEl.appendChild(teamInput)

  // ── Shared Stats Grid (Single + Stack only) ──
  const sharedStatsGrid = document.createElement('div')
  sharedStatsGrid.className = 'grid grid-cols-3 gap-1.5'
  const sharedStatButtons = new Map<StatKey, HTMLButtonElement>()

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
      refreshSharedStatButtons()
      clearError()
    })
    sharedStatButtons.set(key, btn)
    sharedStatsGrid.appendChild(btn)
  }
  formEl.appendChild(sharedStatsGrid)

  // Notes
  const notesInput = document.createElement('input')
  notesInput.className = 'appearance-none bg-surface-raised border border-border rounded text-text px-3 py-2 text-sm w-full transition-all placeholder:text-text-dim focus:outline-none focus:border-purple focus:ring-2 focus:ring-purple/15'
  notesInput.type = 'text'
  notesInput.maxLength = 300
  notesInput.placeholder = 'Notes...'
  formEl.appendChild(notesInput)

  // ── Stack section (Stack only) ──
  const stackSection = document.createElement('div')
  stackSection.className = 'flex flex-col gap-2'

  const stackCountRow = document.createElement('div')
  stackCountRow.className = 'flex items-center gap-2'

  const stackCountLabel = document.createElement('label')
  stackCountLabel.className = 'text-xs font-bold text-text-muted uppercase tracking-wider whitespace-nowrap'
  stackCountLabel.textContent = 'Count'
  stackCountRow.appendChild(stackCountLabel)

  const stackCountInput = document.createElement('input')
  stackCountInput.className = 'flex-1 text-center bg-surface-raised border border-border rounded text-text px-2 py-1.5 text-sm transition-all placeholder:text-text-dim focus:outline-none focus:border-purple focus:ring-2 focus:ring-purple/15'
  stackCountInput.type = 'number'
  stackCountInput.min = '1'
  stackCountInput.max = '20'
  stackCountInput.value = '10'
  stackCountInput.inputMode = 'numeric'
  stackCountInput.addEventListener('change', () => {
    state.stackCount = clamp(parseInt(stackCountInput.value, 10) || 1, 1, 20)
    stackCountInput.value = String(state.stackCount)
    refreshSubmitButton()
    clearError()
  })
  stackCountRow.appendChild(stackCountInput)
  stackSection.appendChild(stackCountRow)

  const stackHint = document.createElement('div')
  stackHint.className = 'text-[0.65rem] text-text-dim'
  stackHint.textContent = 'All drops share the same time, stats, and main stat.'
  stackSection.appendChild(stackHint)

  formEl.appendChild(stackSection)

  // ── Bulk section (Bulk only) ──
  const bulkSection = document.createElement('div')
  bulkSection.className = 'flex flex-col gap-2'

  // Drop count
  const countRow = document.createElement('div')
  countRow.className = 'flex items-center gap-2'

  const countLabel = document.createElement('label')
  countLabel.className = 'text-xs font-bold text-text-muted uppercase tracking-wider whitespace-nowrap'
  countLabel.textContent = 'Drops'
  countRow.appendChild(countLabel)

  const countInput = document.createElement('input')
  countInput.className = 'flex-1 text-center bg-surface-raised border border-border rounded text-text px-2 py-1.5 text-sm transition-all placeholder:text-text-dim focus:outline-none focus:border-purple focus:ring-2 focus:ring-purple/15'
  countInput.type = 'number'
  countInput.min = '1'
  countInput.max = '20'
  countInput.value = '5'
  countInput.inputMode = 'numeric'
  countInput.addEventListener('change', () => {
    const val = clamp(parseInt(countInput.value, 10) || 1, 1, 20)
    countInput.value = String(val)
    state.dropCount = val
    initDrops(val)
    rebuildBulkDropCards()
    refreshSubmitButton()
  })
  countRow.appendChild(countInput)
  bulkSection.appendChild(countRow)

  // Drop cards container
  const dropsContainer = document.createElement('div')
  dropsContainer.className = 'flex flex-col gap-2 max-h-96 overflow-y-auto scrollbar-thin pr-1'
  bulkSection.appendChild(dropsContainer)

  formEl.appendChild(bulkSection)

  // Submit area
  const submitArea = document.createElement('div')
  submitArea.className = 'flex flex-col gap-2 mt-1'

  const errorEl = document.createElement('div')
  errorEl.className = 'text-sm text-red font-medium min-h-[1.1rem]'
  submitArea.appendChild(errorEl)

  const submitBtn = document.createElement('button')
  submitBtn.className = `w-full bg-gradient-to-br text-white border-transparent rounded py-3 text-sm font-bold cursor-pointer transition-all hover:-translate-y-0.5 shadow-lg ${
    isConsole
      ? 'from-gold to-gold-dim hover:from-gold-bright hover:to-gold shadow-gold/15'
      : 'from-purple to-purple-dim hover:from-purple-bright hover:to-purple shadow-purple/15'
  }`
  submitBtn.type = 'button'
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
  initDrops(state.dropCount)
  refreshLogModeButtons()
  refreshModeVisibility()

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

  function createSmallNumberInput(min: number, max: number, placeholder: string): HTMLInputElement {
    const input = document.createElement('input')
    input.className = 'w-12 text-center bg-surface border border-border rounded text-text px-1 py-1 text-xs transition-all placeholder:text-text-dim focus:outline-none focus:border-purple focus:ring-1 focus:ring-purple/15'
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

  function refreshSharedStatButtons() {
    for (const [key, btn] of sharedStatButtons.entries()) {
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

  function refreshModeVisibility() {
    const m = logMode
    if (m === 'single' || m === 'stack') {
      timeSection.classList.remove('hidden')
      sharedStatsGrid.classList.remove('hidden')
      if (sharedMainStatWrap) sharedMainStatWrap.classList.remove('hidden')
    } else {
      timeSection.classList.add('hidden')
      sharedStatsGrid.classList.add('hidden')
      if (sharedMainStatWrap) sharedMainStatWrap.classList.add('hidden')
    }

    stackSection.classList.toggle('hidden', m !== 'stack')
    bulkSection.classList.toggle('hidden', m !== 'bulk')

    if (m === 'bulk') {
      rebuildBulkDropCards()
    }
    refreshSubmitButton()
  }

  function refreshSubmitButton() {
    if (logMode === 'single') {
      submitBtn.textContent = isConsole ? 'Log Console Pull' : 'Log Rewind Pull'
    } else if (logMode === 'bulk') {
      const count = state.dropCount
      submitBtn.textContent = isConsole
        ? `Log ${count} Console Pull${count === 1 ? '' : 's'}`
        : `Log ${count} Rewind Pull${count === 1 ? '' : 's'}`
    } else {
      const count = state.stackCount
      submitBtn.textContent = isConsole
        ? `Log ${count} Console Pull${count === 1 ? '' : 's'}`
        : `Log ${count} Rewind Pull${count === 1 ? '' : 's'}`
    }
  }

  function clearError() {
    errorEl.textContent = ''
    tagInput.classList.remove('border-red')
    if (sharedMainStatSelect) sharedMainStatSelect.classList.remove('border-red')
    dropsContainer.querySelectorAll('.border-red').forEach((el) => el.classList.remove('border-red'))
  }

  function showError(msg: string, element?: HTMLElement | null) {
    errorEl.textContent = msg
    if (msg.toLowerCase().includes('tag')) {
      tagInput.classList.add('border-red')
    }
    if (msg.toLowerCase().includes('main stat') && sharedMainStatSelect) {
      sharedMainStatSelect.classList.add('border-red')
    }
    if (element) {
      element.classList.add('border-red')
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

  function rebuildBulkDropCards() {
    dropsContainer.innerHTML = ''

    for (let i = 0; i < state.drops.length; i++) {
      const drop = state.drops[i]

      const card = document.createElement('div')
      card.className = 'bg-surface-raised border border-border rounded p-2.5 flex flex-col gap-2'

      // Header
      const header = document.createElement('div')
      header.className = 'flex items-center justify-between'

      const dropLabel = document.createElement('span')
      dropLabel.className = 'text-xs font-extrabold text-text-muted uppercase tracking-wider'
      dropLabel.textContent = `Drop #${i + 1}`
      header.appendChild(dropLabel)

      const clearDropBtn = document.createElement('button')
      clearDropBtn.className = 'text-[0.6rem] text-red font-bold cursor-pointer transition-all hover:underline'
      clearDropBtn.type = 'button'
      clearDropBtn.textContent = 'Clear'
      clearDropBtn.addEventListener('click', () => {
        drop.stats.clear()
        drop.mainStat = null
        drop.hour = state.hour
        drop.minute = state.minute
        drop.second = state.second
        rebuildBulkDropCards()
      })
      header.appendChild(clearDropBtn)

      card.appendChild(header)

      // Time row HH:MM:SS
      const timeWrap = document.createElement('div')
      timeWrap.className = 'flex items-center gap-1'

      const hh = createSmallNumberInput(0, 23, 'HH')
      hh.value = pad2(drop.hour)
      hh.addEventListener('change', () => {
        drop.hour = clamp(parseInt(hh.value, 10) || 0, 0, 23)
        hh.value = pad2(drop.hour)
        clearError()
      })
      timeWrap.appendChild(hh)

      const colon1 = document.createElement('span')
      colon1.className = 'text-text-muted text-xs'
      colon1.textContent = ':'
      timeWrap.appendChild(colon1)

      const mm = createSmallNumberInput(0, 59, 'MM')
      mm.value = pad2(drop.minute)
      mm.addEventListener('change', () => {
        drop.minute = clamp(parseInt(mm.value, 10) || 0, 0, 59)
        mm.value = pad2(drop.minute)
        clearError()
      })
      timeWrap.appendChild(mm)

      const colon2 = document.createElement('span')
      colon2.className = 'text-text-muted text-xs'
      colon2.textContent = ':'
      timeWrap.appendChild(colon2)

      const ss = createSmallNumberInput(0, 59, 'SS')
      ss.value = pad2(drop.second)
      ss.addEventListener('change', () => {
        drop.second = clamp(parseInt(ss.value, 10) || 0, 0, 59)
        ss.value = pad2(drop.second)
        clearError()
      })
      timeWrap.appendChild(ss)

      card.appendChild(timeWrap)

      // Main stat (Console only)
      if (isConsole) {
        const msWrap = document.createElement('div')
        msWrap.className = 'flex flex-col gap-1'

        const msLabel = document.createElement('div')
        msLabel.className = 'text-[0.6rem] font-bold text-text-muted uppercase tracking-wider'
        msLabel.textContent = 'Main Stat'
        msWrap.appendChild(msLabel)

        const msSelect = document.createElement('select')
        msSelect.className = 'appearance-none bg-surface border border-border rounded text-text px-2 py-1.5 text-xs w-full transition-all focus:outline-none focus:border-purple focus:ring-2 focus:ring-purple/15 cursor-pointer'
        const emptyOpt = document.createElement('option')
        emptyOpt.value = ''
        emptyOpt.textContent = 'Select...'
        msSelect.appendChild(emptyOpt)
        for (const stat of CONSOLE_MAIN_STAT_OPTIONS) {
          const opt = document.createElement('option')
          opt.value = stat
          opt.textContent = stat
          msSelect.appendChild(opt)
        }
        msSelect.value = drop.mainStat || ''
        msSelect.addEventListener('change', () => {
          drop.mainStat = msSelect.value as ConsoleMainStat || null
          msSelect.classList.remove('border-red')
          clearError()
        })
        msWrap.appendChild(msSelect)
        card.appendChild(msWrap)
      }

      // Sub stats grid
      const dropStatsGrid = document.createElement('div')
      dropStatsGrid.className = 'grid grid-cols-3 gap-1'

      for (const key of statKeys) {
        const btn = document.createElement('button')
        btn.className = 'bg-surface border border-border rounded py-1 text-[0.65rem] font-bold text-text-muted cursor-pointer transition-all hover:bg-border hover:text-text hover:-translate-y-px'
        btn.type = 'button'
        btn.textContent = STAT_LABELS[key]
        const active = drop.stats.has(key)
        if (active) {
          btn.classList.remove('bg-surface', 'border-border', 'text-text-muted')
          btn.classList.add('bg-green/18', 'text-green', 'border-green-dim', 'shadow-lg', 'shadow-green/15')
        }
        btn.addEventListener('click', () => {
          if (drop.stats.has(key)) {
            drop.stats.delete(key)
          } else {
            drop.stats.add(key)
          }
          const nowActive = drop.stats.has(key)
          btn.classList.toggle('bg-green/18', nowActive)
          btn.classList.toggle('text-green', nowActive)
          btn.classList.toggle('border-green-dim', nowActive)
          btn.classList.toggle('shadow-lg', nowActive)
          btn.classList.toggle('shadow-green/15', nowActive)
          btn.classList.toggle('bg-surface', !nowActive)
          btn.classList.toggle('border-border', !nowActive)
          btn.classList.toggle('text-text-muted', !nowActive)
          clearError()
        })
        dropStatsGrid.appendChild(btn)
      }

      card.appendChild(dropStatsGrid)
      dropsContainer.appendChild(card)
    }
  }

  function buildPayload(drop?: DropConfig): PullInsertPayload {
    const userTag = tagInput.value.trim()
    const stats = drop ? drop.stats : state.stats
    return {
      user_tag: userTag,
      session_id: getSessionId(),
      server_region: serverSelect.value as ServerRegion,
      pull_hour: drop ? drop.hour : state.hour,
      pull_minute: drop ? drop.minute : state.minute,
      pull_second: (drop ? drop.second : state.second) as SecondOption,
      time_source: drop ? 'manual' : state.timeSource,
      logged_client_at: state.clientAt || new Date().toISOString(),
      timezone_offset_minutes: state.offset,
      team_label: teamInput.value.trim() || undefined,
      notes: notesInput.value.trim() || undefined,
      has_flat_hp: stats.has('has_flat_hp'),
      has_flat_atk: stats.has('has_flat_atk'),
      has_flat_def: stats.has('has_flat_def'),
      has_hp_pct: stats.has('has_hp_pct'),
      has_atk_pct: stats.has('has_atk_pct'),
      has_def_pct: stats.has('has_def_pct'),
      has_dmg_pct: stats.has('has_dmg_pct'),
      has_crit_rate: stats.has('has_crit_rate'),
      has_crit_dmg: stats.has('has_crit_dmg'),
      has_break_intensity: stats.has('has_break_intensity'),
      has_cycle_intensity: stats.has('has_cycle_intensity'),
    }
  }

  async function handleSubmit() {
    clearError()
    clearSuccess()

    const userTag = tagInput.value.trim()
    if (!userTag || userTag.length > 32) {
      showError('Tag required (max 32 chars)')
      return
    }

    try {
      if (logMode === 'single') {
        if (state.stats.size === 0) {
          showError('Select at least one substat')
          return
        }
        if (isConsole && !state.mainStat) {
          showError('Select a main stat')
          return
        }

        if (isConsole) {
          const payload: ConsolePullInsertPayload = {
            ...buildPayload(),
            main_stat: state.mainStat!,
          }
          await insertConsolePull(payload)
        } else {
          await insertPull(buildPayload())
        }

        state.stats.clear()
        refreshSharedStatButtons()
        notesInput.value = ''
        if (sharedMainStatSelect) {
          sharedMainStatSelect.value = ''
          state.mainStat = null
        }
      } else if (logMode === 'stack') {
        if (state.stats.size === 0) {
          showError('Select at least one substat')
          return
        }
        if (isConsole && !state.mainStat) {
          showError('Select a main stat')
          return
        }

        const count = state.stackCount
        if (isConsole) {
          const base = buildPayload()
          const payloads: ConsolePullInsertPayload[] = []
          for (let i = 0; i < count; i++) {
            payloads.push({ ...base, main_stat: state.mainStat! })
          }
          await insertConsolePullsBulk(payloads)
        } else {
          const base = buildPayload()
          const payloads: PullInsertPayload[] = []
          for (let i = 0; i < count; i++) {
            payloads.push(base)
          }
          await insertPullsBulk(payloads)
        }

        state.stats.clear()
        refreshSharedStatButtons()
        notesInput.value = ''
        if (sharedMainStatSelect) {
          sharedMainStatSelect.value = ''
          state.mainStat = null
        }
      } else {
        // Bulk mode
        const invalidIndices: number[] = []
        for (let i = 0; i < state.drops.length; i++) {
          const drop = state.drops[i]
          if (drop.stats.size === 0) invalidIndices.push(i)
          if (isConsole && !drop.mainStat) invalidIndices.push(i)
        }

        if (invalidIndices.length > 0) {
          const unique = [...new Set(invalidIndices)].map((i) => `#${i + 1}`).join(', ')
          showError(`Missing subs or main stat in drops ${unique}`)
          return
        }

        if (isConsole) {
          const payloads: ConsolePullInsertPayload[] = state.drops.map((drop) => ({
            ...buildPayload(drop),
            main_stat: drop.mainStat!,
          }))
          await insertConsolePullsBulk(payloads)
        } else {
          const payloads: PullInsertPayload[] = state.drops.map((drop) => buildPayload(drop))
          await insertPullsBulk(payloads)
        }

        // Reset all drop configs
        for (const drop of state.drops) {
          drop.stats.clear()
          drop.mainStat = null
        }
        rebuildBulkDropCards()
        notesInput.value = ''
      }

      showSuccess()
      callbacks.onSubmitted()
      setTimeFromNow()
    } catch (err) {
      showError(normalizeError(err))
    }
  }
}
