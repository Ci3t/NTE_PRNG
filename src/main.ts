import './style.css'
import { isSupabaseConfigured } from './db.ts'
import { mountLogForm } from './components/LogForm.ts'
import { mountHeatMap } from './components/HeatMap.ts'
import { mountFeed } from './components/Feed.ts'

const app = document.getElementById('app')
if (!app) {
  throw new Error('Missing #app mount point')
}

if (!isSupabaseConfigured()) {
  app.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem;">
      <div class="setup-error" style="max-width:640px;">
        <div style="font-size:1.1rem;margin-bottom:0.5rem;">Supabase Not Configured</div>
        <div style="font-weight:500;opacity:0.95;font-size:0.85rem;">
          Copy <code style="background:rgba(255,255,255,0.15);padding:0.125rem 0.375rem;border-radius:0.25rem;">.env.example</code>
          to <code style="background:rgba(255,255,255,0.15);padding:0.125rem 0.375rem;border-radius:0.25rem;">.env</code>
          and fill in your Supabase URL and anon key, then restart the dev server.
        </div>
      </div>
    </div>
  `
} else {
  // Header
  const header = document.createElement('div')
  header.className = 'app-header'

  const title = document.createElement('div')
  title.className = 'app-title'
  title.textContent = 'NTE PRNG Logger'
  header.appendChild(title)

  const clock = document.createElement('div')
  clock.className = 'app-clock'
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

  // Dashboard: left form + right heatmap+feed stacked
  const dashboard = document.createElement('div')
  dashboard.className = 'app-dashboard'

  const leftPanel = document.createElement('div')
  leftPanel.className = 'panel left-panel'

  const rightPanel = document.createElement('div')
  rightPanel.className = 'panel right-panel'

  dashboard.appendChild(leftPanel)
  dashboard.appendChild(rightPanel)
  app.appendChild(dashboard)

  // Right panel has stacked heatmap + feed
  const heatmapPanel = document.createElement('div')
  heatmapPanel.className = 'panel heatmap-panel'

  const feedPanel = document.createElement('div')
  feedPanel.className = 'panel panel-scroll feed-panel'

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
