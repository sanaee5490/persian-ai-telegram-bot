/**
 * رندر چارت کندلی حرفه‌ای — SVG → PNG با @resvg/resvg-js.
 *
 * خروجی PNG همان چیزی است که هم به کاربر نشان داده می‌شود و هم
 * به Gemini Vision داده می‌شود تا مثل یک تریدر تحلیل کند.
 */
import { Resvg } from '@resvg/resvg-js'
import type { Candle, Analysis } from '../ai/market.js'
import { fmtPrice } from '../ai/market.js'

const W = 1000
const H = 620
const PAD = { top: 56, right: 78, bottom: 42, left: 14 }

/** محور قیمت: مقادیر گرد و خوانا */
function ticks(min: number, max: number, count = 6): number[] {
  const span = max - min
  const raw = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10
  const start = Math.ceil(min / step) * step
  const out: number[] = []
  for (let v = start; v <= max; v += step) out.push(v)
  return out
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export interface ChartOpts {
  symbol: string
  label: string
  timeframe: string
  candles: Candle[]
  analysis: Analysis
  /** نام منبع داده — روی MarketQuote است نه Analysis */
  source: string
}

/** ساخت SVG چارت */
export function buildSvg(o: ChartOpts): string {
  const c = o.candles
  const n = c.length
  if (n < 2) throw new Error('کندل کافی نیست')

  const closes = c.map((x) => x.close)
  const e9 = emaOf(closes, 9), e21 = emaOf(closes, 21), e50 = emaOf(closes, 50)

  // ناحیهٔ نمودار
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom - 96 // ۹۶ پیکسل برای حجم
  const volTop = PAD.top + plotH + 12
  const volH = 84

  let hi = -Infinity, lo = Infinity, vmax = 0
  for (const k of c) { hi = Math.max(hi, k.high); lo = Math.min(lo, k.low); vmax = Math.max(vmax, k.volume) }
  const pad = (hi - lo) * 0.06
  hi += pad; lo -= pad

  const cw = plotW / n
  const x = (i: number) => PAD.left + i * cw + cw / 2
  const y = (p: number) => PAD.top + plotH - ((p - lo) / (hi - lo)) * plotH
  const vy = (v: number) => volTop + volH - (v / vmax) * volH

  const up = '#26c281', dn = '#ef4d5a', grid = '#232a36', txt = '#8b95a7'

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Tahoma,DejaVu Sans,sans-serif">`
  s += `<rect width="${W}" height="${H}" fill="#11151d"/>`

  // ── عنوان ──
  const chg = o.analysis.change24h
  const chgCol = chg >= 0 ? up : dn
  const arrow = chg >= 0 ? '▲' : '▼'
  s += `<text x="${PAD.left + 4}" y="30" fill="#e8ecf4" font-size="21" font-weight="bold">${esc(o.label)}</text>`
  s += `<text x="${PAD.left + 4}" y="50" fill="${chgCol}" font-size="15">${esc(o.symbol)} · ${esc(o.timeframe)} · $${fmtPrice(o.analysis.price)} <tspan font-size="12">${arrow} ${Math.abs(chg).toFixed(2)}%</tspan></text>`
  s += `<text x="${W - PAD.right + 4}" y="30" fill="${txt}" font-size="13" text-anchor="start">${esc(o.source)}</text>`
  s += `<text x="${W - PAD.right + 4}" y="50" fill="${txt}" font-size="12" text-anchor="start">روند: ${esc(o.analysis.trend)}</text>`

  // ── شبکه و محور قیمت ──
  for (const t of ticks(lo, hi)) {
    const yy = y(t)
    s += `<line x1="${PAD.left}" y1="${yy}" x2="${W - PAD.right}" y2="${yy}" stroke="${grid}" stroke-width="1"/>`
    s += `<text x="${W - PAD.right + 6}" y="${yy + 4}" fill="${txt}" font-size="11">${fmtPrice(t)}</text>`
  }

  // ── خطوط راهنما: EMA ──
  const line = (vals: number[], color: string, dash = '') => {
    let d = ''
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(vals[i])) continue
      d += (d ? ' L' : 'M') + x(i).toFixed(1) + ' ' + y(vals[i]!).toFixed(1)
    }
    if (!d) return ''
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" opacity="0.85" ${dash}/>`
  }
  s += line(e50, '#5b8def', 'stroke-dasharray="4 3"')
  s += line(e21, '#f5a623')
  s += line(e9, '#9b6cff')

  // ── بولینگر ──
  const bb = bollingerOf(closes, 20, 2)
  const band = (vals: number[]) => {
    let d = ''
    for (let i = 0; i < n; i++) if (Number.isFinite(vals[i])) d += (d ? ' L' : 'M') + x(i).toFixed(1) + ' ' + y(vals[i]!).toFixed(1)
    return d
  }
  const upD = band(bb.up), dnD = band(bb.dn)
  if (upD && dnD) {
    s += `<path d="${upD} L${x(n - 1).toFixed(1)} ${y(bb.dn[n - 1]!).toFixed(1)}" fill="none" stroke="#3ecfd0" stroke-width="1" opacity="0.35"/>`
    s += `<path d="${dnD} L${x(n - 1).toFixed(1)} ${y(bb.up[n - 1]!).toFixed(1)}" fill="none" stroke="#3ecfd0" stroke-width="1" opacity="0.35"/>`
  }

  // ── سطوح حمایت و مقاومت ──
  for (const r of o.analysis.resistance.slice(0, 2)) {
    const yy = y(r)
    s += `<line x1="${PAD.left}" y1="${yy}" x2="${W - PAD.right}" y2="${yy}" stroke="${dn}" stroke-width="1" stroke-dasharray="6 4" opacity="0.6"/>`
    s += `<text x="${PAD.left + 6}" y="${yy - 4}" fill="${dn}" font-size="10.5" opacity="0.9">مقاومت ${fmtPrice(r)}</text>`
  }
  for (const sp of o.analysis.support.slice(0, 2)) {
    const yy = y(sp)
    s += `<line x1="${PAD.left}" y1="${yy}" x2="${W - PAD.right}" y2="${yy}" stroke="${up}" stroke-width="1" stroke-dasharray="6 4" opacity="0.6"/>`
    s += `<text x="${PAD.left + 6}" y="${yy - 4}" fill="${up}" font-size="10.5" opacity="0.9">حمایت ${fmtPrice(sp)}</text>`
  }

  // ── کندل‌ها ──
  const bw = Math.max(1.4, cw * 0.62)
  for (let i = 0; i < n; i++) {
    const k = c[i]!
    const col = k.close >= k.open ? up : dn
    const cx = x(i)
    s += `<line x1="${cx}" y1="${y(k.high)}" x2="${cx}" y2="${y(k.low)}" stroke="${col}" stroke-width="1.1"/>`
    const yo = y(k.open), yc = y(k.close)
    const top = Math.min(yo, yc), h = Math.max(1.2, Math.abs(yc - yo))
    s += `<rect x="${(cx - bw / 2).toFixed(2)}" y="${top.toFixed(2)}" width="${bw.toFixed(2)}" height="${h.toFixed(2)}" fill="${col}"/>`
  }

  // ── قیمت فعلی ──
  const lastY = y(o.analysis.price)
  s += `<line x1="${PAD.left}" y1="${lastY}" x2="${W - PAD.right}" y2="${lastY}" stroke="#e8ecf4" stroke-width="1" stroke-dasharray="2 3" opacity="0.7"/>`
  s += `<rect x="${W - PAD.right + 2}" y="${lastY - 9}" width="70" height="18" rx="3" fill="#e8ecf4"/>`
  s += `<text x="${W - PAD.right + 37}" y="${lastY + 4}" fill="#11151d" font-size="11" text-anchor="middle" font-weight="bold">${fmtPrice(o.analysis.price)}</text>`

  // ── حجم ──
  s += `<text x="${PAD.left + 4}" y="${volTop - 2}" fill="${txt}" font-size="11">حجم</text>`
  s += `<line x1="${PAD.left}" y1="${volTop + volH}" x2="${W - PAD.right}" y2="${volTop + volH}" stroke="${grid}"/>`
  for (let i = 0; i < n; i++) {
    const k = c[i]!
    const col = k.close >= k.open ? up : dn
    const vh = Math.max(1, volH - (vy(k.volume) - volTop))
    s += `<rect x="${(x(i) - bw / 2).toFixed(2)}" y="${vy(k.volume).toFixed(2)}" width="${bw.toFixed(2)}" height="${vh.toFixed(2)}" fill="${col}" opacity="0.55"/>`
  }
  s += `<line x1="${PAD.left}" y1="${vy(o.analysis.avgVol)}" x2="${W - PAD.right}" y2="${vy(o.analysis.avgVol)}" stroke="${txt}" stroke-width="1" stroke-dasharray="4 3" opacity="0.5"/>`

  // ── زمان ──
  const stepT = Math.max(1, Math.floor(n / 6))
  for (let i = n - 1; i >= 0; i -= stepT) {
    const d = new Date(c[i]!.time)
    const lbl = o.timeframe === '1d'
      ? `${d.getUTCDate()}/${d.getUTCMonth() + 1}`
      : `${String(d.getUTCHours()).padStart(2, '0')}:00`
    s += `<text x="${x(i)}" y="${H - 20}" fill="${txt}" font-size="11" text-anchor="middle">${lbl}</text>`
  }

  // ── راهنمای رنگ ──
  s += `<g font-size="11" fill="${txt}">`
  s += `<rect x="${PAD.left + 4}" y="${H - 15}" width="9" height="9" fill="#9b6cff"/><text x="${PAD.left + 17}" y="${H - 7}">EMA9</text>`
  s += `<rect x="${PAD.left + 72}" y="${H - 15}" width="9" height="9" fill="#f5a623"/><text x="${PAD.left + 85}" y="${H - 7}">EMA21</text>`
  s += `<rect x="${PAD.left + 143}" y="${H - 15}" width="9" height="9" fill="#5b8def"/><text x="${PAD.left + 156}" y="${H - 7}">EMA50</text>`
  s += `<rect x="${PAD.left + 214}" y="${H - 15}" width="9" height="9" fill="#3ecfd0" opacity="0.5"/><text x="${PAD.left + 227}" y="${H - 7}">بولینگر</text>`
  s += `</g>`

  s += `</svg>`
  return s
}

// محاسبات سبک برای رسم
function emaOf(v: number[], p: number): number[] {
  const k = 2 / (p + 1)
  const out: number[] = [v[0]!]
  for (let i = 1; i < v.length; i++) out.push(v[i]! * k + out[i - 1]! * (1 - k))
  return out
}
function bollingerOf(v: number[], p: number, mult: number) {
  const mid: number[] = [], up: number[] = [], dn: number[] = []
  for (let i = 0; i < v.length; i++) {
    if (i < p - 1) { mid.push(NaN); up.push(NaN); dn.push(NaN); continue }
    let s = 0
    for (let j = i - p + 1; j <= i; j++) s += v[j]!
    const m = s / p
    let q = 0
    for (let j = i - p + 1; j <= i; j++) q += (v[j]! - m) ** 2
    const sd = Math.sqrt(q / p)
    mid.push(m); up.push(m + mult * sd); dn.push(m - mult * sd)
  }
  return { mid, up, dn }
}

/** خروجی نهایی: PNG */
export function renderChart(o: ChartOpts): Buffer {
  const svg = buildSvg(o)
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    background: '#11151d',
    font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' },
  })
  return resvg.render().asPng()
}
