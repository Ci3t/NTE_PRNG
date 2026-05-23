import { type PullRow, type ConsolePullRow, type StatKey, STAT_LABELS, SECOND_OPTIONS } from '../types.ts'
import { fetchAllPulls, fetchAllConsolePulls, normalizeError } from '../db.ts'

function pad(n: number, len = 2): string {
  return n.toString().padStart(len, '0')
}

function formatIso(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function activeStats(row: PullRow | ConsolePullRow): string[] {
  const keys = Object.keys(STAT_LABELS) as StatKey[]
  return keys.filter((k) => (row as unknown as Record<string, boolean>)[k]).map((k) => STAT_LABELS[k])
}

function buildReport(free: PullRow[], console: ConsolePullRow[]): string {
  const now = new Date()
  const header = `══════════════════════════════════════════════════════════════════
  NTE PRNG ANALYSIS REPORT
  Generated: ${now.toISOString()}
  Free Pulls: ${free.length}  |  Stamina Pulls: ${console.length}
══════════════════════════════════════════════════════════════════\n\n`

  // ── Executive Summary ──
  const freeDualCrit = free.filter((r) => r.is_dual_crit).length
  const freeCritRate = free.filter((r) => r.has_crit_rate).length
  const freeCritDmg = free.filter((r) => r.has_crit_dmg).length
  const freeDmgPct = free.filter((r) => r.has_dmg_pct).length

  const consoleDualCrit = console.filter((r) => r.is_dual_crit).length
  const consoleCritRate = console.filter((r) => r.has_crit_rate).length
  const consoleCritDmg = console.filter((r) => r.has_crit_dmg).length
  const consoleDmgPct = console.filter((r) => r.has_dmg_pct).length

  const pct = (n: number, d: number) => d > 0 ? ((n / d) * 100).toFixed(1) : '0.0'

  let report = header
  report += `┌────────────────────────────────────────────────────────────────┐\n`
  report += `│ EXECUTIVE SUMMARY                                              │\n`
  report += `├────────────────────────────────────────────────────────────────┤\n`
  report += `│ FREE PULLS                                                     │\n`
  report += `│   Total:        ${String(free.length).padEnd(47)}│\n`
  report += `│   Dual CRIT:    ${String(`${freeDualCrit} (${pct(freeDualCrit, free.length)}%)`).padEnd(47)}│\n`
  report += `│   CRIT Rate:    ${String(`${freeCritRate} (${pct(freeCritRate, free.length)}%)`).padEnd(47)}│\n`
  report += `│   CRIT DMG:     ${String(`${freeCritDmg} (${pct(freeCritDmg, free.length)}%)`).padEnd(47)}│\n`
  report += `│   DMG%:         ${String(`${freeDmgPct} (${pct(freeDmgPct, free.length)}%)`).padEnd(47)}│\n`
  report += `├────────────────────────────────────────────────────────────────┤\n`
  report += `│ STAMINA PULLS                                                  │\n`
  report += `│   Total:        ${String(console.length).padEnd(47)}│\n`
  report += `│   Dual CRIT:    ${String(`${consoleDualCrit} (${pct(consoleDualCrit, console.length)}%)`).padEnd(47)}│\n`
  report += `│   CRIT Rate:    ${String(`${consoleCritRate} (${pct(consoleCritRate, console.length)}%)`).padEnd(47)}│\n`
  report += `│   CRIT DMG:     ${String(`${consoleCritDmg} (${pct(consoleCritDmg, console.length)}%)`).padEnd(47)}│\n`
  report += `│   DMG%:         ${String(`${consoleDmgPct} (${pct(consoleDmgPct, console.length)}%)`).padEnd(47)}│\n`
  report += `└────────────────────────────────────────────────────────────────┘\n\n`

  // ── Helper to build per-second table ──
  function buildSecondTable(rows: (PullRow | ConsolePullRow)[], label: string): string {
    let out = `\n${label} — PER-SECOND BREAKDOWN\n`
    out += `──────────────────────────────────────────────────────────────────\n`
    out += `Second  Count  DualCrit  CRITRate  CRITDMG   DMG%      Best Stats\n`
    out += `──────────────────────────────────────────────────────────────────\n`

    for (const sec of SECOND_OPTIONS) {
      const secRows = rows.filter((r) => r.pull_second === sec)
      if (secRows.length === 0) {
        out += ` :${pad(sec)}    —      —         —         —         —         —\n`
        continue
      }
      const dc = secRows.filter((r) => r.is_dual_crit).length
      const cr = secRows.filter((r) => r.has_crit_rate).length
      const cd = secRows.filter((r) => r.has_crit_dmg).length
      const dm = secRows.filter((r) => r.has_dmg_pct).length

      // Best stats for this second (most common)
      const statCounts = new Map<string, number>()
      for (const r of secRows) {
        for (const s of activeStats(r)) {
          statCounts.set(s, (statCounts.get(s) || 0) + 1)
        }
      }
      const bestStats = Array.from(statCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => `${name}(${count})`)
        .join(', ')

      out += ` :${pad(sec)}    ${String(secRows.length).padEnd(6)} ${String(`${dc}(${pct(dc, secRows.length)}%)`).padEnd(9)} ${String(`${cr}(${pct(cr, secRows.length)}%)`).padEnd(9)} ${String(`${cd}(${pct(cd, secRows.length)}%)`).padEnd(9)} ${String(`${dm}(${pct(dm, secRows.length)}%)`).padEnd(9)} ${bestStats}\n`
    }

    // Find hot zone recommendation
    const withData = SECOND_OPTIONS.map((sec) => {
      const secRows = rows.filter((r) => r.pull_second === sec)
      const dc = secRows.filter((r) => r.is_dual_crit).length
      return { sec, total: secRows.length, dcPct: secRows.length > 0 ? (dc / secRows.length) : 0 }
    }).filter((x) => x.total >= 3)

    if (withData.length > 0) {
      withData.sort((a, b) => b.dcPct - a.dcPct)
      const top = withData[0]
      out += `\n  HOT ZONE → :${pad(top.sec)} (Dual CRIT ${(top.dcPct * 100).toFixed(1)}% across ${top.total} pulls)\n`
    }

    return out + '\n'
  }

  report += buildSecondTable(free, 'FREE PULLS')
  report += buildSecondTable(console, 'STAMINA PULLS')

  // ── Per-Hour Breakdown ──
  function buildHourTable(rows: (PullRow | ConsolePullRow)[], label: string): string {
    let out = `\n${label} — PER-HOUR BREAKDOWN\n`
    out += `──────────────────────────────────────────────────────────────────\n`
    out += `Hour  Count  DualCrit  CRITRate  CRITDMG   DMG%\n`
    out += `──────────────────────────────────────────────────────────────────\n`

    for (let h = 0; h < 24; h++) {
      const hourRows = rows.filter((r) => r.pull_hour === h)
      if (hourRows.length === 0) continue
      const dc = hourRows.filter((r) => r.is_dual_crit).length
      const cr = hourRows.filter((r) => r.has_crit_rate).length
      const cd = hourRows.filter((r) => r.has_crit_dmg).length
      const dm = hourRows.filter((r) => r.has_dmg_pct).length
      out += ` ${pad(h)}h   ${String(hourRows.length).padEnd(6)} ${String(`${dc}(${pct(dc, hourRows.length)}%)`).padEnd(9)} ${String(`${cr}(${pct(cr, hourRows.length)}%)`).padEnd(9)} ${String(`${cd}(${pct(cd, hourRows.length)}%)`).padEnd(9)} ${String(`${dm}(${pct(dm, hourRows.length)}%)`).padEnd(9)}\n`
    }

    const bestHour = Array.from({ length: 24 }, (_, h) => {
      const hourRows = rows.filter((r) => r.pull_hour === h)
      const dc = hourRows.filter((r) => r.is_dual_crit).length
      return { h, total: hourRows.length, dcPct: hourRows.length > 0 ? dc / hourRows.length : 0 }
    }).filter((x) => x.total >= 3).sort((a, b) => b.dcPct - a.dcPct)[0]

    if (bestHour) {
      out += `\n  BEST HOUR → ${pad(bestHour.h)}h (Dual CRIT ${(bestHour.dcPct * 100).toFixed(1)}% across ${bestHour.total} pulls)\n`
    }

    return out + '\n'
  }

  report += buildHourTable(free, 'FREE PULLS')
  report += buildHourTable(console, 'STAMINA PULLS')

  // ── Per-Server Breakdown ──
  function buildServerTable(rows: (PullRow | ConsolePullRow)[], label: string): string {
    const servers = ['EU', 'NA', 'Asia'] as const
    let out = `\n${label} — PER-SERVER BREAKDOWN\n`
    out += `──────────────────────────────────────────────────────────────────\n`
    out += `Server  Count  DualCrit  CRITRate  CRITDMG   DMG%\n`
    out += `──────────────────────────────────────────────────────────────────\n`

    for (const srv of servers) {
      const srvRows = rows.filter((r) => r.server_region === srv)
      if (srvRows.length === 0) continue
      const dc = srvRows.filter((r) => r.is_dual_crit).length
      const cr = srvRows.filter((r) => r.has_crit_rate).length
      const cd = srvRows.filter((r) => r.has_crit_dmg).length
      const dm = srvRows.filter((r) => r.has_dmg_pct).length
      out += ` ${srv.padEnd(6)} ${String(srvRows.length).padEnd(6)} ${String(`${dc}(${pct(dc, srvRows.length)}%)`).padEnd(9)} ${String(`${cr}(${pct(cr, srvRows.length)}%)`).padEnd(9)} ${String(`${cd}(${pct(cd, srvRows.length)}%)`).padEnd(9)} ${String(`${dm}(${pct(dm, srvRows.length)}%)`).padEnd(9)}\n`
    }
    return out + '\n'
  }

  report += buildServerTable(free, 'FREE PULLS')
  report += buildServerTable(console, 'STAMINA PULLS')

  // ── Side-by-Side Comparison ──
  report += `\n══════════════════════════════════════════════════════════════════\n`
  report += `  SIDE-BY-SIDE COMPARISON (Seconds with 3+ pulls in both modes)\n`
  report += `══════════════════════════════════════════════════════════════════\n\n`
  report += `Second  Free-DC%  Stam-DC%  Winner    Free-N  Stam-N\n`
  report += `──────────────────────────────────────────────────────────────────\n`

  for (const sec of SECOND_OPTIONS) {
    const fRows = free.filter((r) => r.pull_second === sec)
    const cRows = console.filter((r) => r.pull_second === sec)
    if (fRows.length < 3 && cRows.length < 3) continue

    const fDc = fRows.length > 0 ? ((fRows.filter((r) => r.is_dual_crit).length / fRows.length) * 100).toFixed(1) : '—'
    const cDc = cRows.length > 0 ? ((cRows.filter((r) => r.is_dual_crit).length / cRows.length) * 100).toFixed(1) : '—'

    let winner = '—'
    if (fRows.length >= 3 && cRows.length >= 3) {
      const fVal = parseFloat(fDc)
      const cVal = parseFloat(cDc)
      winner = fVal > cVal ? 'FREE' : cVal > fVal ? 'STAMINA' : 'TIE'
    }

    report += ` :${pad(sec)}    ${String(fDc).padEnd(9)} ${String(cDc).padEnd(9)} ${String(winner).padEnd(9)} ${String(fRows.length).padEnd(7)} ${cRows.length}\n`
  }

  // ── Raw Data ──
  report += `\n\n══════════════════════════════════════════════════════════════════\n`
  report += `  RAW DATA — FREE PULLS (newest first)\n`
  report += `══════════════════════════════════════════════════════════════════\n\n`
  report += `#   Date/Time(Server)    User      :SS   Server  Source  Stats\n`
  report += `──────────────────────────────────────────────────────────────────\n`

  for (let i = 0; i < free.length; i++) {
    const r = free[i]
    const stats = activeStats(r).join(', ')
    report += `${String(i + 1).padEnd(3)} ${formatIso(r.created_at)}  ${r.user_tag.padEnd(9)} :${pad(r.pull_second)}   ${r.server_region.padEnd(6)} ${r.time_source.padEnd(7)} ${stats}\n`
  }

  report += `\n\n══════════════════════════════════════════════════════════════════\n`
  report += `  RAW DATA — STAMINA PULLS (newest first)\n`
  report += `══════════════════════════════════════════════════════════════════\n\n`
  report += `#   Date/Time(Server)    User      :SS   Server  Source  Stats\n`
  report += `──────────────────────────────────────────────────────────────────\n`

  for (let i = 0; i < console.length; i++) {
    const r = console[i]
    const stats = activeStats(r).join(', ')
    report += `${String(i + 1).padEnd(3)} ${formatIso(r.created_at)}  ${r.user_tag.padEnd(9)} :${pad(r.pull_second)}   ${r.server_region.padEnd(6)} ${r.time_source.padEnd(7)} ${stats}\n`
  }

  report += `\n\n══════════════════════════════════════════════════════════════════\n`
  report += `  END OF REPORT\n`
  report += `══════════════════════════════════════════════════════════════════\n`

  return report
}

function triggerDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function mountExportButton(container: HTMLElement) {
  const btn = document.createElement('button')
  btn.className = 'bg-surface-raised border border-border rounded px-3 py-1.5 text-xs font-bold text-text-muted cursor-pointer transition-all hover:bg-border hover:text-text hover:-translate-y-px flex items-center gap-1.5'
  btn.type = 'button'

  const icon = document.createElement('span')
  icon.textContent = '↓'
  btn.appendChild(icon)

  const label = document.createElement('span')
  label.textContent = 'Export'
  btn.appendChild(label)

  btn.addEventListener('click', async () => {
    const originalText = label.textContent
    label.textContent = 'Loading...'
    btn.disabled = true
    btn.classList.add('opacity-50')

    try {
      const [free, console] = await Promise.all([
        fetchAllPulls('all', 'all', 5000, true),
        fetchAllConsolePulls('all', 'all', 5000, true),
      ])

      const report = buildReport(free, console)
      const timestamp = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0]
      triggerDownload(`NTE_PRNG_Report_${timestamp}.txt`, report)
    } catch (err) {
      label.textContent = `Error: ${normalizeError(err)}`
      setTimeout(() => {
        label.textContent = originalText
      }, 3000)
    } finally {
      btn.disabled = false
      btn.classList.remove('opacity-50')
      if (label.textContent === 'Loading...') {
        label.textContent = originalText
      }
    }
  })

  container.appendChild(btn)
}
