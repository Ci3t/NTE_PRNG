import './style.css'
import { isSupabaseConfigured } from './db.ts'
import { mountLogForm } from './components/LogForm.ts'
import { mountHeatMap } from './components/HeatMap.ts'
import { mountFeed } from './components/Feed.ts'

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
  // Header
  const header = document.createElement('div')
  header.className = 'flex items-center justify-between px-5 py-3 border-b border-border-subtle bg-surface/90 backdrop-blur-xl shrink-0'

  const title = document.createElement('div')
  title.className = 'font-black text-sm tracking-widest uppercase bg-gradient-to-r from-purple-bright to-gold-bright bg-clip-text text-transparent'
  title.textContent = 'NTE PRNG Logger'
  header.appendChild(title)

  const clock = document.createElement('div')
  clock.className = 'tabular-nums font-bold text-base text-text-muted tracking-wide font-[var(--font-mono)]'
  header.appendChild(clock)

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

  app.appendChild(header)

  // Dashboard: stacked on mobile, side-by-side on desktop
  const dashboard = document.createElement('div')
  // Mobile: scrollable full page; Desktop: locked height, panels scroll independently
  dashboard.className = 'flex-1 flex flex-col md:flex-row gap-4 p-4 min-h-0 md:overflow-hidden overflow-y-auto'

  const leftPanel = document.createElement('div')
  leftPanel.className = 'flex flex-col min-h-0 md:w-[400px] shrink-0 md:overflow-hidden'

  const rightPanel = document.createElement('div')
  rightPanel.className = 'flex flex-col gap-4 flex-1 min-h-0 md:overflow-hidden'

  dashboard.appendChild(leftPanel)
  dashboard.appendChild(rightPanel)
  app.appendChild(dashboard)

  // Right panel: heatmap + feed stacked
  const heatmapPanel = document.createElement('div')
  heatmapPanel.className = 'flex flex-col shrink-0'

  const feedPanel = document.createElement('div')
  feedPanel.className = 'flex flex-col flex-1 min-h-0 md:overflow-hidden'

  rightPanel.appendChild(heatmapPanel)
  rightPanel.appendChild(feedPanel)

  const heatMap = mountHeatMap(heatmapPanel, {
    onSecondSelected: (second) => {
      feed.setSecondFilter(second)
    },
  })

  const feed = mountFeed(feedPanel, {})

  mountLogForm(leftPanel, {
    onSubmitted: () => {
      heatMap.refresh()
      feed.refresh()
    },
  })
}
