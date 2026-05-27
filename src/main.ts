import './style.css'
import { isSupabaseConfigured } from './db.ts'
import { mountLogForm } from './components/LogForm.ts'
import { mountHeatMap } from './components/HeatMap.ts'
import { mountFeed } from './components/Feed.ts'
import { mountConsoleHeatMap } from './components/ConsoleHeatMap.ts'
import { mountConsoleFeed } from './components/ConsoleFeed.ts'
import { mountExportButton } from './components/DataExport.ts'
import { mountAnalysis } from './components/Analysis.ts'
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
  let currentPage: 'dashboard' | 'analysis' = 'dashboard'
  
  let freeHeatMapRef: ReturnType<typeof mountHeatMap> | null = null
  let freeFeedRef: ReturnType<typeof mountFeed> | null = null
  let consoleHeatMapRef: ReturnType<typeof mountConsoleHeatMap> | null = null
  let consoleFeedRef: ReturnType<typeof mountConsoleFeed> | null = null
  let analysisRef: ReturnType<typeof mountAnalysis> | null = null

  // Header
  const header = document.createElement('div')
  header.className = 'flex items-center justify-between px-5 py-3 border-b border-border-subtle bg-surface/90 backdrop-blur-xl shrink-0'

  const leftHeader = document.createElement('div')
  leftHeader.className = 'flex items-center gap-3'

  const title = document.createElement('div')
  title.className = 'font-black text-sm tracking-widest uppercase bg-gradient-to-r from-purple-bright to-gold-bright bg-clip-text text-transparent'
  title.textContent = 'NTE PRNG Logger'
  leftHeader.appendChild(title)

  // Page toggle: Dashboard / Analysis
  const pageToggle = document.createElement('div')
  pageToggle.className = 'flex items-center gap-1 bg-surface-raised border border-border rounded p-0.5 ml-2'

  const dashboardBtn = document.createElement('button')
  dashboardBtn.className = 'px-2 py-1 text-[0.65rem] font-bold rounded transition-all'
  dashboardBtn.textContent = 'Dashboard'
  dashboardBtn.type = 'button'

  const analysisBtn = document.createElement('button')
  analysisBtn.className = 'px-2 py-1 text-[0.65rem] font-bold rounded transition-all'
  analysisBtn.textContent = 'Analysis'
  analysisBtn.type = 'button'

  function refreshPageButtons() {
    const dashActive = currentPage === 'dashboard'
    dashboardBtn.classList.toggle('bg-purple', dashActive)
    dashboardBtn.classList.toggle('text-white', dashActive)
    dashboardBtn.classList.toggle('shadow-sm', dashActive)
    dashboardBtn.classList.toggle('text-text-muted', !dashActive)

    analysisBtn.classList.toggle('bg-purple', !dashActive)
    analysisBtn.classList.toggle('text-white', !dashActive)
    analysisBtn.classList.toggle('shadow-sm', !dashActive)
    analysisBtn.classList.toggle('text-text-muted', dashActive)
    
    // Hide mode toggle when on analysis page
    modeToggle.style.display = dashActive ? 'flex' : 'none'
  }

  dashboardBtn.addEventListener('click', () => {
    if (currentPage !== 'dashboard') {
      currentPage = 'dashboard'
      refreshPageButtons()
      swapPage()
    }
  })

  analysisBtn.addEventListener('click', () => {
    if (currentPage !== 'analysis') {
      currentPage = 'analysis'
      refreshPageButtons()
      swapPage()
    }
  })

  pageToggle.appendChild(dashboardBtn)
  pageToggle.appendChild(analysisBtn)
  leftHeader.appendChild(pageToggle)

  // Mode toggle: Rewind / Console
  const modeToggle = document.createElement('div')
  modeToggle.className = 'flex items-center gap-1 bg-surface-raised border border-border rounded p-0.5'

  const rewindBtn = document.createElement('button')
  rewindBtn.className = 'px-2 py-1 text-[0.65rem] font-bold rounded transition-all'
  rewindBtn.textContent = 'Rewind'
  rewindBtn.type = 'button'

  const consoleBtn = document.createElement('button')
  consoleBtn.className = 'px-2 py-1 text-[0.65rem] font-bold rounded transition-all'
  consoleBtn.textContent = 'Console'
  consoleBtn.type = 'button'

  function refreshModeButtons() {
    const rewindActive = currentMode === 'free'
    rewindBtn.classList.toggle('bg-purple', rewindActive)
    rewindBtn.classList.toggle('text-white', rewindActive)
    rewindBtn.classList.toggle('shadow-sm', rewindActive)
    rewindBtn.classList.toggle('text-text-muted', !rewindActive)

    consoleBtn.classList.toggle('bg-gold', !rewindActive)
    consoleBtn.classList.toggle('text-white', !rewindActive)
    consoleBtn.classList.toggle('shadow-sm', !rewindActive)
    consoleBtn.classList.toggle('text-text-muted', rewindActive)
  }

  rewindBtn.addEventListener('click', () => {
    if (currentMode !== 'free') {
      currentMode = 'free'
      setPullMode(currentMode)
      refreshModeButtons()
      swapDashboard()
    }
  })

  consoleBtn.addEventListener('click', () => {
    if (currentMode !== 'stamina') {
      currentMode = 'stamina'
      setPullMode(currentMode)
      refreshModeButtons()
      swapDashboard()
    }
  })

  modeToggle.appendChild(rewindBtn)
  modeToggle.appendChild(consoleBtn)
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

  // Main Content Area
  const contentArea = document.createElement('div')
  contentArea.className = 'flex-1 flex flex-col min-h-0 relative'
  app.appendChild(contentArea)

  // Dashboard wrapper
  const dashboardWrapper = document.createElement('div')
  dashboardWrapper.className = 'absolute inset-0 flex flex-col md:flex-row gap-4 p-4 min-h-0 md:overflow-hidden'

  const leftPanel = document.createElement('div')
  leftPanel.className = 'flex flex-col min-h-0 md:w-[400px] shrink-0 md:overflow-hidden'

  const rightPanel = document.createElement('div')
  rightPanel.className = 'flex flex-col gap-4 flex-1 min-h-0 md:overflow-hidden'

  dashboardWrapper.appendChild(leftPanel)
  dashboardWrapper.appendChild(rightPanel)

  // Analysis wrapper
  const analysisWrapper = document.createElement('div')
  analysisWrapper.className = 'absolute inset-0 flex flex-col min-h-0 overflow-y-auto hidden bg-surface'

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

  function swapPage() {
    if (currentPage === 'dashboard') {
      dashboardWrapper.classList.remove('hidden')
      analysisWrapper.classList.add('hidden')
    } else {
      dashboardWrapper.classList.add('hidden')
      analysisWrapper.classList.remove('hidden')
      
      if (!analysisRef) {
        analysisRef = mountAnalysis(analysisWrapper)
      } else {
        analysisRef.refresh()
      }
    }
  }

  contentArea.appendChild(dashboardWrapper)
  contentArea.appendChild(analysisWrapper)

  // Initial mount
  refreshPageButtons()
  refreshModeButtons()
  swapDashboard()
  swapPage()
}
