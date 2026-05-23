import './style.css'
import { isSupabaseConfigured } from './db.ts'
import { mountLogForm } from './components/LogForm.ts'
import { mountHeatMap } from './components/HeatMap.ts'
import { mountFeed } from './components/Feed.ts'
import { mountConsoleHeatMap } from './components/ConsoleHeatMap.ts'
import { mountConsoleFeed } from './components/ConsoleFeed.ts'
import { mountExportButton } from './components/DataExport.ts'
import { getPullMode, setPullMode } from './session.ts'
import type { PullMode, SecondOption } from './types.ts'

const app = document.getElementById('app')
if (!app) {
  throw new Error('Missing #app mount point')
}

function createCenteredWrapper() {
  const wrapper = document.createElement('div')
  wrapper.className = 'flex items-center justify-center min-h-screen p-4'
  return wrapper
}

function createSetupError() {
  const card = document.createElement('div')
  card.className = 'bg-gradient-to-br from-red-900 to-red-500 text-white rounded-lg p-4 text-center font-semibold shadow-lg max-w-2xl'

  const title = document.createElement('div')
  title.className = 'text-base mb-2'
  title.textContent = 'Supabase Not Configured'
  card.appendChild(title)

  const body = document.createElement('div')
  body.className = 'font-medium opacity-95 text-sm'

  const text1 = document.createTextNode('Copy ')
  body.appendChild(text1)

  const code1 = document.createElement('code')
  code1.className = 'bg-white/15 px-1 rounded'
  code1.textContent = '.env.example'
  body.appendChild(code1)

  const text2 = document.createTextNode(' to ')
  body.appendChild(text2)

  const code2 = document.createElement('code')
  code2.className = 'bg-white/15 px-1 rounded'
  code2.textContent = '.env'
  body.appendChild(code2)

  const text3 = document.createTextNode(' and fill in your Supabase URL and anon key, then restart the dev server.')
  body.appendChild(text3)

  card.appendChild(body)

  const wrapper = createCenteredWrapper()
  wrapper.appendChild(card)
  return wrapper
}

if (!isSupabaseConfigured()) {
  app.appendChild(createSetupError())
} else {
  let currentMode: PullMode = getPullMode()
  let freeHeatMapRef: ReturnType<typeof mountHeatMap> | null = null
  let freeFeedRef: ReturnType<typeof mountFeed> | null = null
  let consoleHeatMapRef: ReturnType<typeof mountConsoleHeatMap> | null = null
  let consoleFeedRef: ReturnType<typeof mountConsoleFeed> | null = null

  // Header
  const header = document.createElement('div')
  header.className = 'flex items-center justify-between px-5 py-3 border-b border-border-subtle bg-surface/90 backdrop-blur-xl shrink-0'

  const leftHeader = document.createElement('div')
  leftHeader.className = 'flex items-center gap-3'

  const title = document.createElement('div')
  title.className = 'font-black text-sm tracking-widest uppercase bg-gradient-to-r from-purple-bright to-gold-bright bg-clip-text text-transparent'
  title.textContent = 'NTE PRNG Logger'
  leftHeader.appendChild(title)

  // Mode toggle
  const modeToggle = document.createElement('div')
  modeToggle.className = 'flex items-center gap-1 bg-surface-raised border border-border rounded p-0.5'

  const freeBtn = document.createElement('button')
  freeBtn.className = 'px-2 py-1 text-[0.65rem] font-bold rounded transition-all'
  freeBtn.textContent = 'FREE'
  freeBtn.type = 'button'

  const staminaBtn = document.createElement('button')
  staminaBtn.className = 'px-2 py-1 text-[0.65rem] font-bold rounded transition-all'
  staminaBtn.textContent = 'STAMINA'
  staminaBtn.type = 'button'

  function refreshModeButtons() {
    const freeActive = currentMode === 'free'
    freeBtn.classList.toggle('bg-purple', freeActive)
    freeBtn.classList.toggle('text-white', freeActive)
    freeBtn.classList.toggle('shadow-sm', freeActive)
    freeBtn.classList.toggle('text-text-muted', !freeActive)

    staminaBtn.classList.toggle('bg-gold', !freeActive)
    staminaBtn.classList.toggle('text-white', !freeActive)
    staminaBtn.classList.toggle('shadow-sm', !freeActive)
    staminaBtn.classList.toggle('text-text-muted', freeActive)
  }

  freeBtn.addEventListener('click', () => {
    if (currentMode !== 'free') {
      currentMode = 'free'
      setPullMode(currentMode)
      refreshModeButtons()
      swapDashboard()
    }
  })

  staminaBtn.addEventListener('click', () => {
    if (currentMode !== 'stamina') {
      currentMode = 'stamina'
      setPullMode(currentMode)
      refreshModeButtons()
      swapDashboard()
    }
  })

  modeToggle.appendChild(freeBtn)
  modeToggle.appendChild(staminaBtn)
  leftHeader.appendChild(modeToggle)

  header.appendChild(leftHeader)

  const rightHeader = document.createElement('div')
  rightHeader.className = 'flex items-center gap-3'

  // Export button
  mountExportButton(rightHeader)

  const clock = document.createElement('div')
  clock.className = 'tabular-nums font-bold text-base text-text-muted tracking-wide font-[var(--font-mono)]'
  rightHeader.appendChild(clock)

  function updateClock() {
    const now = new Date()
    const h = now.getHours().toString().padStart(2, '0')
    const m = now.getMinutes().toString().padStart(2, '0')
    const s = now.getSeconds().toString().padStart(2, '0')
    const ms = Math.floor(now.getMilliseconds() / 10).toString().padStart(2, '0')
    clock.textContent = `${h}:${m}:${s}.${ms}`
  }
  updateClock()
  setInterval(updateClock, 50)

  header.appendChild(rightHeader)
  app.appendChild(header)

  // Dashboard wrapper
  const dashboard = document.createElement('div')
  dashboard.className = 'flex-1 flex flex-col md:flex-row gap-4 p-4 min-h-0 md:overflow-hidden'

  const leftPanel = document.createElement('div')
  leftPanel.className = 'flex flex-col min-h-0 md:w-[400px] shrink-0 md:overflow-hidden'

  const rightPanel = document.createElement('div')
  rightPanel.className = 'flex flex-col gap-4 flex-1 min-h-0 md:overflow-hidden'

  dashboard.appendChild(leftPanel)
  dashboard.appendChild(rightPanel)
  app.appendChild(dashboard)

  // Right panel content areas
  const freeHeatmapPanel = document.createElement('div')
  freeHeatmapPanel.className = 'flex flex-col shrink-0'

  const freeFeedPanel = document.createElement('div')
  freeFeedPanel.className = 'flex flex-col flex-1 min-h-0 md:overflow-hidden'

  const consoleHeatmapPanel = document.createElement('div')
  consoleHeatmapPanel.className = 'flex flex-col shrink-0'

  const consoleFeedPanel = document.createElement('div')
  consoleFeedPanel.className = 'flex flex-col flex-1 min-h-0 md:overflow-hidden'

  function mountFreeComponents() {
    freeHeatMapRef = mountHeatMap(freeHeatmapPanel, {
      onSecondSelected: (second: SecondOption | null) => {
        if (freeFeedRef) freeFeedRef.setSecondFilter(second)
      },
    })

    freeFeedRef = mountFeed(freeFeedPanel, {})
  }

  function mountConsoleComponents() {
    consoleHeatMapRef = mountConsoleHeatMap(consoleHeatmapPanel, {
      onSecondSelected: (second: SecondOption | null) => {
        if (consoleFeedRef) consoleFeedRef.setSecondFilter(second)
      },
    })

    consoleFeedRef = mountConsoleFeed(consoleFeedPanel, {})
  }

  function mountLogFormComponent() {
    // Clear left panel
    while (leftPanel.firstChild) {
      leftPanel.removeChild(leftPanel.firstChild)
    }
    mountLogForm(leftPanel, { mode: currentMode }, {
      onSubmitted: () => {
        if (currentMode === 'free') {
          if (freeHeatMapRef) freeHeatMapRef.refresh()
          if (freeFeedRef) freeFeedRef.refresh()
        } else {
          if (consoleHeatMapRef) consoleHeatMapRef.refresh()
          if (consoleFeedRef) consoleFeedRef.refresh()
        }
      },
    })
  }

  function swapDashboard() {
    // Clear right panel
    while (rightPanel.firstChild) {
      rightPanel.removeChild(rightPanel.firstChild)
    }

    if (currentMode === 'free') {
      rightPanel.appendChild(freeHeatmapPanel)
      rightPanel.appendChild(freeFeedPanel)
      if (!freeHeatMapRef) mountFreeComponents()
    } else {
      rightPanel.appendChild(consoleHeatmapPanel)
      rightPanel.appendChild(consoleFeedPanel)
      if (!consoleHeatMapRef) mountConsoleComponents()
    }

    mountLogFormComponent()
  }

  // Initial mount
  refreshModeButtons()
  swapDashboard()
}
