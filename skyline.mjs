// Usage:  node skyline.mjs <github-username>     -> writes skyline.svg
//         node skyline.mjs --demo                -> sample data, no network
// Same camera/projection/bar-height maths as the contribution-skyline component.
import { writeFileSync } from "node:fs"

const arg = process.argv[2]
if (!arg) { console.error("Usage: node skyline.mjs <github-username>"); process.exit(1) }
const DAY = 86400000
const key = (ms) => new Date(ms).toISOString().slice(0, 10)
const ms = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))

async function load() {
  if (arg === "--demo") {
    let a = 7; const r = () => ((a = (a * 16807) % 2147483647) / 2147483647)
    const end = ms(key(Date.now())); const m = new Map()
    for (let i = 0; i < 371; i++) {
      const d = end - i * DAY, wk = new Date(d).getUTCDay() % 6 === 0
      m.set(key(d), r() < (wk ? 0.25 : 0.65) ? Math.ceil(-Math.log(1 - r()) * (2 + 6 * Math.sin(i / 40) ** 2)) : 0)
    }
    return m
  }
  const res = await fetch(`https://github.com/users/${arg}/contributions`)
  if (!res.ok) throw new Error("GitHub returned " + res.status)
  const html = await res.text()
  const tips = new Map()
  for (const t of html.matchAll(/<tool-tip[^>]*\bfor="([^"]+)"[^>]*>([^<]*)</g)) tips.set(t[1], +(/(\d+)\s+contribution/.exec(t[2])?.[1] ?? 0))
  const m = new Map()
  for (const t of html.matchAll(/<td\b[^>]*ContributionCalendar-day[^>]*>/g)) {
    const date = /data-date="([\d-]+)"/.exec(t[0])?.[1], id = /\bid="([^"]+)"/.exec(t[0])?.[1]
    if (date) m.set(date, tips.get(id) ?? 0)
  }
  if (!m.size) throw new Error("No contribution data found (check the username)")
  return m
}

const counts = await load()
const end = Math.max(...[...counts.keys()].map(ms))
let start = end - 364 * DAY; start -= new Date(start).getUTCDay() * DAY
const cells = []
for (let t = start, i = 0; t <= end; t += DAY, i++) cells.push({ date: key(t), count: counts.get(key(t)) ?? 0, week: Math.floor(i / 7), day: i % 7 })
const weeks = cells[cells.length - 1].week + 1
const nz = cells.map((c) => c.count).filter((c) => c > 0).sort((a, b) => a - b)
const busy = nz.length ? nz[Math.floor(0.95 * (nz.length - 1))] : 0
const max = nz.length ? nz[nz.length - 1] : 0
for (const c of cells) c.level = c.count <= 0 ? 0 : busy <= 0 ? 4 : 1 + Math.min(3, Math.floor((c.count / busy) * 4))

// stats
let total = 0, best = { count: 0, date: "" }, run = 0, rs = "", longest = { days: 0, s: "", e: "" }
for (const c of cells) {
  total += c.count
  if (c.count > best.count) best = { count: c.count, date: c.date }
  if (c.count) { if (!run) rs = c.date; run++; if (run > longest.days) longest = { days: run, s: rs, e: c.date } } else run = 0
}
let j = cells.length - 1; if (cells[j].count === 0) j--
const endAt = j; while (j >= 0 && cells[j].count > 0) j--
const cur = { days: endAt - j, s: cells[j + 1]?.date, e: cells[endAt]?.date }
const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
const fy = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
const f = (d) => fmt.format(ms(d)), rng = (a, b) => (a ? f(a) + " — " + f(b) : "—")

// camera (isometric corner view)
const yaw = Math.PI / 4, elev = (34 * Math.PI) / 180
const cs = Math.cos(yaw), sn = Math.sin(yaw), se = Math.sin(elev), ce = Math.cos(elev)
const bh = (c) => (c > 0 && max > 0 ? 0.4 + Math.pow(c / max, 0.85) * 7.2 : 0.2)
const P = (x, y, z) => [x * cs - y * sn, (x * sn + y * cs) * se - z * ce]
const w = 0.9, off = 0.05
let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9
for (const c of cells) for (const [x, y, z] of [[c.week + off, c.day + off, bh(c.count)], [c.week + off + w, c.day + off + w, 0], [c.week + off, c.day + off + w, 0], [c.week + off + w, c.day + off, 0]]) {
  const [px, py] = P(x, y, z); minx = Math.min(minx, px); maxx = Math.max(maxx, px); miny = Math.min(miny, py); maxy = Math.max(maxy, py)
}
const W = 980, pad = 30, s = (W - pad * 2) / (maxx - minx)
const H = Math.max(380, Math.round((maxy - miny) * s + pad * 2 + 30))
const ox = pad - minx * s, oy = pad + 10 - miny * s
const pt = (x, y, z) => { const [a, b] = P(x, y, z); return (ox + a * s).toFixed(1) + "," + (oy + b * s).toFixed(1) }

// colours: light + dark palettes (GitHub greens), faces shaded like the component
const PAL = { light: ["#ebedf0", "#c6e48b", "#7bc96f", "#239a3b", "#196127"], dark: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"] }
const shade = (h, k) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * k).toString(16).padStart(2, "0")).join("")
const css = (t) => PAL[t].map((c, i) => `.t${i}{fill:${c}}.l${i}{fill:${shade(c, 0.84)}}.r${i}{fill:${shade(c, 0.68)}}`).join("")

const order = [...cells].sort((a, b) => (a.week + .5) * sn + (a.day + .5) * cs - ((b.week + .5) * sn + (b.day + .5) * cs))
let bars = ""
for (const c of order) {
  const x0 = c.week + off, y0 = c.day + off, x1 = x0 + w, y1 = y0 + w, z = bh(c.count), L = c.level
  bars += `<polygon class="l${L}" points="${pt(x0, y1, 0)} ${pt(x1, y1, 0)} ${pt(x1, y1, z)} ${pt(x0, y1, z)}"/>`
  bars += `<polygon class="r${L}" points="${pt(x1, y0, 0)} ${pt(x1, y1, 0)} ${pt(x1, y1, z)} ${pt(x1, y0, z)}"/>`
  bars += `<polygon class="t${L}" points="${pt(x0, y0, z)} ${pt(x1, y0, z)} ${pt(x1, y1, z)} ${pt(x0, y1, z)}"><title>${c.count} contributions on ${fy.format(ms(c.date))}</title></polygon>`
}
let months = "", prev = -1, edge = -1e9
for (let k = 0; k < weeks; k++) {
  const c = cells[k * 7]; if (!c) break
  const m = +c.date.slice(5, 7)
  if (m !== prev) {
    const [a, b] = P(k + 0.5, 7.3, 0), x = ox + a * s
    if (x > edge) { months += `<text x="${x.toFixed(1)}" y="${(oy + b * s + 14).toFixed(1)}" class="m">${new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(ms(c.date))}</text>`; edge = x + 34 }
  }
  prev = m
}
const stat = (x, y, anchor, label, value, unit, sub) =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" class="m">${label}</text>` +
  `<text x="${x}" y="${y + 46}" text-anchor="${anchor}" class="big">${value}</text>` +
  `<text x="${x}" y="${y + 66}" text-anchor="${anchor}" class="u">${unit}</text>` +
  `<text x="${x}" y="${y + 84}" text-anchor="${anchor}" class="m">${sub}</text>`
const nfm = new Intl.NumberFormat("en-US")
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${total} contributions in the last year, shown as a 3D skyline">
<style>
text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
.m{font-size:12px;fill:#656d76}.u{font-size:14px;fill:#1f2328}.big{font-size:46px;font-weight:600;fill:#196127;letter-spacing:-1px}
${css("light")}
@media (prefers-color-scheme:dark){.m{fill:#8b949e}.u{fill:#e6edf3}.big{fill:#39d353}${css("dark")}}
</style>
${bars}${months}
${stat(W - pad, 40, "end", "1 year total", nfm.format(total), "contributions", fy.format(ms(cells[0].date)) + " — " + fy.format(end))}
${stat(W - pad, 150, "end", "Busiest day", nfm.format(best.count), "contributions", best.date ? f(best.date) : "—")}
${stat(pad, H - 235, "start", "Longest streak", longest.days, "days", rng(longest.s, longest.e))}
${stat(pad, H - 110, "start", "Current streak", cur.days, "days", rng(cur.s, cur.e))}
</svg>`
writeFileSync("skyline.svg", svg)
console.log("Wrote skyline.svg —", nfm.format(total), "contributions")
