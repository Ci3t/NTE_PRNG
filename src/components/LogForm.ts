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
    drops: [] as DropConfig[],
  }

  function initDrops(count: number) {
    while (state.drops.length < count) {
      state.drops.push({ stats: new Set<StatKey>(), mainStat: null })
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

  // Single / Bulk toggle
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

  function refreshLogModeButtons() {
    const singleActive = logMode === 'single'
    singleBtn.classList.toggle('bg-purple', singleActive)
    singleBtn.classList.toggle('text-white', singleActive)
    singleBtn.classList.toggle('shadow-sm', singleActive)
    singleBtn.classList.toggle('text-text-muted', !singleActive)

    bulkBtn.classList.toggle('bg-gold', !singleActive)
    bulkBtn.classList.toggle('text-white', !singleActive)
    bulkBtn.classList.toggle('shadow-sm', !singleActive)
    bulkBtn.classList.toggle('text-text-muted', singleActive)
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

  modeToggle.appendChild(singleBtn)
  modeToggle.appendChild(bulkBtn)
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

  // ── Shared Time Section ──
  const timeSection = document.createElement('div')
  timeSection.className = 'flex flex-col gap-2'

  // Time display
  const timeDisplay = document.createElement('div')
  timeDisplay.className = 'tabular-nums font-extrabold text-2xl tracking-wide text-text text-center py-2 bg-surface-raised rounded border border-border font-[var(--font-mono)] shadow-inner'
  timeSection.appendChild(timeDisplay)

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

  // ── Main Stat (Console single only) ──
  let singleMainStatSelect: HTMLSelectElement | null = null
  const singleMainStatWrap = document.createElement('div')
  singleMainStatWrap.className = 'flex flex-col gap-1'
  if (isConsole) {
    const mainStatLabel = document.createElement('div')
    mainStatLabel.className = 'text-[0.65rem] font-bold text-text-muted uppercase tracking-wider'
    mainStatLabel.textContent = 'Main Stat'
    singleMainStatWrap.appendChild(mainStatLabel)

    singleMainStatSelect = document.createElement('select')
    singleMainStatSelect.className = 'appearance-none bg-surface-raised border border-border rounded text-text px-3 py-2 text-sm w-full transition-all focus:outline-none focus:border-purple focus:ring-2 focus:ring-purple/15 cursor-pointer'
    const emptyOpt = document.createElement('option')
    emptyOpt.value = ''
    emptyOpt.textContent = 'Select main stat...'
    singleMainStatSelect.appendChild(emptyOpt)
    for (const stat of CONSOLE_MAIN_STAT_OPTIONS) {
      const opt = document.createElement('option')
      opt.value = stat
      opt.textContent = stat
      singleMainStatSelect.appendChild(opt)
    }
    singleMainStatSelect.addEventListener('change', () => {
      state.mainStat = singleMainStatSelect!.value as ConsoleMainStat || null
      clearError()
    })
    singleMainStatWrap.appendChild(singleMainStatSelect)
    formEl.appendChild(singleMainStatWrap)
  }

  // Team label
  const teamInput = document.createElement('input')
  teamInput.className = 'appearance-none bg-surface-raised border border-border rounded text-text px-3 py-2 text-sm w-full transition-all placeholder:text-text-dim focus:outline-none focus:border-purple focus:ring-2 focus:ring-purple/15'
  teamInput.type = 'text'
  teamInput.maxLength = 80
  teamInput.placeholder = 'Team / Character'
  formEl.appendChild(teamInput)

  // ── SINGLE: Stat toggles ──
  const singleStatsGrid = document.createElement('div')
  singleStatsGrid.className = 'grid grid-cols-3 gap-1.5'
  const singleStatButtons = new Map<StatKey, HTMLButtonElement>()

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
      refreshSingleStatButtons()
      clearError()
    })
    singleStatButtons.set(key, btn)
    singleStatsGrid.appendChild(btn)
  }
  formEl.appendChild(singleStatsGrid)

  // Notes
  const notesInput = document.createElement('input')
  notesInput.className = 'appearance-none bg-surface-raised border border-border rounded text-text px-3 py-2 text-sm w-full transition-all placeholder:text-text-dim focus:outline-none focus:border-purple focus:ring-2 focus:ring-purple/15'
  notesInput.type = 'text'
  notesInput.maxLength = 300
  notesInput.placeholder = 'Notes...'
  formEl.appendChild(notesInput)

  // ── BULK section ──
  const bulkSection = document.createElement('div')
  bulkSection.className = 'flex flex-col gap-2'

  // Drop count input
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

  function refreshSingleStatButtons() {
    for (const [key, btn] of singleStatButtons.entries()) {
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
    if (logMode === 'single') {
      bulkSection.classList.add('hidden')
      singleStatsGrid.classList.remove('hidden')
      if (singleMainStatWrap) singleMainStatWrap.classList.remove('hidden')
    } else {
      bulkSection.classList.remove('hidden')
      singleStatsGrid.classList.add('hidden')
      if (singleMainStatWrap) singleMainStatWrap.classList.add('hidden')
      rebuildBulkDropCards()
    }
    refreshSubmitButton()
  }

  function refreshSubmitButton() {
    if (logMode === 'single') {
      submitBtn.textContent = isConsole ? 'Log Console Pull' : 'Log Rewind Pull'
    } else {
      const count = state.dropCount
      submitBtn.textContent = isConsole
        ? `Log ${count} Console Pull${count === 1 ? '' : 's'}`
        : `Log ${count} Rewind Pull${count === 1 ? '' : 's'}`
    }
  }

  function clearError() {
    errorEl.textContent = ''
    tagInput.classList.remove('border-red')
    if (singleMainStatSelect) singleMainStatSelect.classList.remove('border-red')
    // Also clear any bulk card error borders
    dropsContainer.querySelectorAll('.border-red').forEach((el) => el.classList.remove('border-red'))
  }

  function showError(msg: string, element?: HTMLElement | null) {
    errorEl.textContent = msg
    if (msg.toLowerCase().includes('tag')) {
      tagInput.classList.add('border-red')
    }
    if (msg.toLowerCase().includes('main stat') && singleMainStatSelect) {
      singleMainStatSelect.classList.add('border-red')
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

      // Quick clear this drop
      const clearDropBtn = document.createElement('button')
      clearDropBtn.className = 'text-[0.6rem] text-red font-bold cursor-pointer transition-all hover:underline'
      clearDropBtn.type = 'button'
      clearDropBtn.textContent = 'Clear'
      clearDropBtn.addEventListener('click', () => {
        drop.stats.clear()
        drop.mainStat = null
        rebuildBulkDropCards()
      })
      header.appendChild(clearDropBtn)

      card.appendChild(header)

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
      pull_hour: state.hour,
      pull_minute: state.minute,
      pull_second: state.second,
      time_source: state.timeSource,
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
        refreshSingleStatButtons()
        notesInput.value = ''
        if (singleMainStatSelect) {
          singleMainStatSelect.value = ''
          state.mainStat = null
        }
      } else {
        // Bulk mode — validate each drop
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
