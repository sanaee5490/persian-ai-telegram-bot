/**
 * تحلیل بازارهای مالی — گرفتن دادهٔ کندل و محاسبهٔ اندیکاتورها.
 *
 * منابع (رایگان و بدون کلید):
 *   OKX       → منبع اصلی رمزارز (۶۰+ نماد)
 *   Kraken    → پشتیبان اول
 *   Coinbase  → پشتیبان دوم
 *   gold-api  → قیمت لحظه‌ای طلا
 */

export interface Candle {
  /** زمان به میلی‌ثانیه */
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface MarketQuote {
  symbol: string
  /** برچسب فارسی برای نمایش */
  label: string
  /** گروه: crypto | gold */
  kind: 'crypto' | 'gold' | 'index' | 'forex'
  note?: string
  price: number
  /** تغییر درصدی ۲۴ ساعته */
  change24h: number
  candles: Candle[]
  timeframe: string
  source: string
}

/** نمادهای پشتیبانی‌شده */
export const SYMBOLS: Record<string, { label: string; okx: string; yahoo?: string; note?: string; kind: 'crypto' | 'gold' | 'index' | 'forex' }> = {
  BTC: { label: '₿ بیت‌کوین', okx: 'BTC-USDT', kind: 'crypto' },
  ETH: { label: 'Ξ اتریوم', okx: 'ETH-USDT', kind: 'crypto' },
  XRP: { label: '✕ ریپل', okx: 'XRP-USDT', kind: 'crypto' },
  SOL: { label: '◎ سولانا', okx: 'SOL-USDT', kind: 'crypto' },
  BNB: { label: '◆ بایننس‌کوین', okx: 'BNB-USDT', kind: 'crypto' },
  DOGE: { label: '🐕 دوج‌کوین', okx: 'DOGE-USDT', kind: 'crypto' },
  ADA: { label: '🔷 کاردانو', okx: 'ADA-USDT', kind: 'crypto' },
  AVAX: { label: '🔺 avalanch', okx: 'AVAX-USDT', kind: 'crypto' },
  LINK: { label: '🔗 چین‌لینک', okx: 'LINK-USDT', kind: 'crypto' },
  TON: { label: '💎 تonos', okx: 'TON-USDT', kind: 'crypto' },
  TRX: { label: '🔻 ترون', okx: 'TRX-USDT', kind: 'crypto' },
  LTC: { label: 'Ł لایت‌کوین', okx: 'LTC-USDT', kind: 'crypto' },
  XAU: { label: '🥇 طلا (آتی COMEX)', okx: '', yahoo: 'GC=F', kind: 'gold', note: 'قرارداد آتی طلا GC؛ نه قیمت نقدی XAUUSD بروکر. سررسید و رول قرارداد می‌تواند اختلاف قیمت ایجاد کند.' },
  DJI: { label: '🏛 داوجونز (US30)', okx: '', yahoo: '^DJI', kind: 'index', note: 'شاخص نقدی داوجونز؛ نه CFD بروکر. داده فقط در ساعات بازار سهام آمریکا.' },
  NDX: { label: '💻 نزدک ۱۰۰ (US100)', okx: '', yahoo: '^NDX', kind: 'index', note: 'شاخص نقدی نزدک ۱۰۰؛ نه نزدک کامپوزیت یا CFD بروکر. داده فقط در ساعات بازار آمریکا.' },
  EURUSD: { label: '💶 یورو / دلار', okx: '', yahoo: 'EURUSD=X', kind: 'forex' },
  GBPUSD: { label: '💷 پوند / دلار', okx: '', yahoo: 'GBPUSD=X', kind: 'forex' },
  USDJPY: { label: '💴 دلار / ین', okx: '', yahoo: 'JPY=X', kind: 'forex' },
}

/** تایم‌فریم‌ها — برچسب فارسی و مقدار OKX */
export const TIMEFRAMES: Record<string, { label: string; okx: string; candles: number }> = {
  '15m': { label: '⏱️ ۱۵ دقیقه', okx: '15m', candles: 100 },
  '1h': { label: '🕐 ۱ ساعت', okx: '1H', candles: 100 },
  '4h': { label: '🕓 ۴ ساعت', okx: '4H', candles: 100 },
  '1d': { label: '📅 روزانه', okx: '1D', candles: 90 },
}

const UA = 'Mozilla/5.0'

async function getJson(url: string, timeout = 15_000): Promise<any> {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeout) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

/** ── منابع داده ─────────────────────────────────────── */

async function fromOkx(okx: string, tf: string, limit: number): Promise<Candle[]> {
  const d = await getJson(`https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(okx)}&bar=${tf}&limit=${limit}`)
  if (d.code !== '0' || !d.data?.length) throw new Error(d.msg || 'داده‌ای نیامد')
  // OKX: [ts, o, h, l, c, vol, volCcy, volCcyQuote] — newest first
  return (d.data as string[][])
    .map((k) => ({
      time: Number(k[0]),
      open: Number(k[1]), high: Number(k[2]), low: Number(k[3]),
      close: Number(k[4]), volume: Number(k[5]),
    }))
    .reverse()
}

async function fromKraken(pair: string, minutes: number): Promise<Candle[]> {
  const d = await getJson(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${minutes}`)
  const key = Object.keys(d.result || {}).find((k) => k !== 'last')
  if (!key) throw new Error('داده‌ای نیامد')
  // Kraken: [time, o, h, l, c, vwap, vol, count] — oldest first
  return (d.result[key] as any[][]).map((k) => ({
    time: k[0] * 1000,
    open: Number(k[1]), high: Number(k[2]), low: Number(k[3]),
    close: Number(k[4]), volume: Number(k[6]),
  }))
}

const KRAKEN_PAIRS: Record<string, { pair: string; minutes: number }> = {
  BTC: { pair: 'XBTUSD', minutes: 60 }, ETH: { pair: 'ETHUSD', minutes: 60 },
  XRP: { pair: 'XRPUSD', minutes: 60 }, SOL: { pair: 'SOLUSD', minutes: 60 },
  ADA: { pair: 'ADAUSD', minutes: 60 }, LINK: { pair: 'LINKUSD', minutes: 60 },
  LTC: { pair: 'LTCUSD', minutes: 60 }, DOGE: { pair: 'XDGUSD', minutes: 60 },
  AVAX: { pair: 'AVAXUSD', minutes: 60 },
}

const CB_PAIRS: Record<string, string> = {
  BTC: 'BTC-USD', ETH: 'ETH-USD', XRP: 'XRP-USD', SOL: 'SOL-USD',
  ADA: 'ADA-USD', LINK: 'LINK-USD', LTC: 'LTC-USD', DOGE: 'DOGE-USD', AVAX: 'AVAX-USD',
}

async function fromCoinbase(id: string, seconds: number): Promise<Candle[]> {
  // Coinbase: [time, low, high, open, close, volume] — newest first
  const rows: number[][] = await getJson(
    `https://api.exchange.coinbase.com/products/${id}/candles?granularity=${seconds}`,
  )
  return rows
    .map((k) => ({
      time: k[0] * 1000,
      open: k[3], high: k[2], low: k[1], close: k[4], volume: k[5],
    }))
    .reverse()
}

/** Yahoo دادهٔ عمومی با تأخیر احتمالی است؛ تضمین سرویس یا قیمت بروکر ندارد. */
async function fromYahoo(ticker: string, timeframe: string): Promise<Candle[]> {
  const interval = timeframe === '4h' ? '60m' : timeframe === '1h' ? '60m' : timeframe
  const range = timeframe === '1d' ? '6mo' : timeframe === '15m' ? '1mo' : '3mo'
  let data: any
  for (const host of ['query1', 'query2']) {
    try {
      const d = await getJson(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`)
      data = d.chart?.result?.[0]
      if (!data?.timestamp?.length) throw new Error('کندل موجود نیست')
      break
    } catch (e) { if (host === 'query2') throw e }
  }
  const q = data.indicators.quote[0]
  let rows: Candle[] = data.timestamp.map((t: number, i: number) => ({
    time: t * 1000, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume?.[i] ?? 0,
  })).filter((c: Candle) => [c.open, c.high, c.low, c.close].every(v => typeof v === 'number' && Number.isFinite(v) && v > 0))
  if (timeframe === '4h') {
    const buckets = new Map<number, Candle>()
    for (const c of rows) {
      const t = Math.floor(c.time / 14_400_000) * 14_400_000
      const prev = buckets.get(t)
      if (!prev) buckets.set(t, { ...c, time: t })
      else { prev.high = Math.max(prev.high, c.high); prev.low = Math.min(prev.low, c.low); prev.close = c.close; prev.volume += c.volume }
    }
    rows = [...buckets.values()]
  }
  if (rows.length < 50) throw new Error('کندل معتبر کافی برای تحلیل وجود ندارد')
  return rows.slice(-TIMEFRAMES[timeframe]!.candles)
}

/** ── API اصلی ───────────────────────────────────────── */

export async function getQuote(symbol: string, timeframe = '1h'): Promise<MarketQuote> {
  const meta = SYMBOLS[symbol]
  if (!meta) throw new Error(`نماد ${symbol} پشتیبانی نمی‌شود`)
  const tf = TIMEFRAMES[timeframe] || TIMEFRAMES['1h']!

  if (!TIMEFRAMES[timeframe]) throw new Error('تایم‌فریم نامعتبر')
  if (meta.yahoo) {
    const candles = await fromYahoo(meta.yahoo, timeframe)
    const last = candles[candles.length - 1]!
    const back = [...candles].reverse().find(c => c.time <= last.time - 86_400_000)
    const age = Math.max(0, Math.round((Date.now() - last.time) / 60000))
    return {
      symbol, label: meta.label, kind: meta.kind, timeframe, candles, price: last.close,
      change24h: back ? (last.close / back.close - 1) * 100 : 0,
      source: 'Yahoo Finance',
      note: [meta.note, 'داده عمومی با تأخیر احتمالی؛ قیمت با بروکر ممکن است متفاوت باشد.',
        `شروع آخرین کندل: ${new Date(last.time).toISOString()} · ${age} دقیقه پیش؛ آخرین کندل ممکن است باز باشد.`,
        'در تعطیلی بازار، آخرین کندل موجود نمایش داده می‌شود. حجم صفر یعنی ناموجود، نه نبود معامله.',
        timeframe === '4h' ? 'کندل ۴ساعته تجمیع ساعتی در مرز UTC است و ممکن است با بروکر تفاوت داشته باشد.' : '',
      ].filter(Boolean).join(' '),
    }
  }

  const errors: string[] = []
  let candles: Candle[] = []
  let source = ''

  // ۱) OKX
  try {
    candles = await fromOkx(meta.okx, tf.okx, tf.candles)
    source = 'OKX'
  } catch (e) { errors.push(`OKX: ${(e as Error).message}`) }

  // ۲) Kraken
  if (!candles.length) {
    const kr = KRAKEN_PAIRS[symbol]
    if (kr) {
      try {
        const all = await fromKraken(kr.pair, ({ '15m': 15, '1h': 60, '4h': 240, '1d': 1440 }[timeframe])!)
        candles = all.slice(-tf.candles)
        source = 'Kraken'
      } catch (e) { errors.push(`Kraken: ${(e as Error).message}`) }
    }
  }

  // ۳) Coinbase
  if (!candles.length) {
    const cb = CB_PAIRS[symbol]
    if (cb) {
      try {
        const all = await fromCoinbase(cb, ({ '15m': 900, '1h': 3600, '4h': 3600, '1d': 86400 }[timeframe])!)
        if (timeframe === '4h') {
          const buckets = new Map<number, Candle>()
          for (const c of all) {
            const t = Math.floor(c.time / 14_400_000) * 14_400_000
            const prev = buckets.get(t)
            if (!prev) buckets.set(t, { ...c, time: t })
            else { prev.high = Math.max(prev.high, c.high); prev.low = Math.min(prev.low, c.low); prev.close = c.close; prev.volume += c.volume }
          }
          candles = [...buckets.values()].slice(-tf.candles)
        } else candles = all.slice(-tf.candles)
        source = 'Coinbase' 
      } catch (e) { errors.push(`Coinbase: ${(e as Error).message}`) }
    }
  }

  if (!candles.length) throw new Error(errors.join(' · ') || 'هیچ منبعی جواب نداد')

  const last = candles[candles.length - 1]!
  // تغییر ۲۴ ساعته بر اساس ۲۴ کندل گذشته
  const back = [...candles].reverse().find(c => c.time <= last.time - 86_400_000)
  const change24h = back ? ((last.close - back.close) / back.close) * 100 : 0

  return {
    symbol, label: meta.label, kind: 'crypto', timeframe,
    price: last.close, change24h, candles, source,
  }
}

/* ── اندیکاتورها ─────────────────────────────────────── */

export function sma(v: number[], p: number): number[] {
  const out: number[] = []
  for (let i = 0; i < v.length; i++) {
    if (i < p - 1) { out.push(NaN); continue }
    let s = 0
    for (let j = i - p + 1; j <= i; j++) s += v[j]!
    out.push(s / p)
  }
  return out
}

export function ema(v: number[], p: number): number[] {
  const k = 2 / (p + 1)
  const out: number[] = [v[0]!]
  for (let i = 1; i < v.length; i++) out.push(v[i]! * k + out[i - 1]! * (1 - k))
  return out
}

export function rsi(v: number[], p = 14): number[] {
  const out: number[] = [NaN]
  let gain = 0, loss = 0
  for (let i = 1; i < v.length; i++) {
    const ch = v[i]! - v[i - 1]!
    const g = Math.max(ch, 0), l = Math.max(-ch, 0)
    if (i <= p) { gain += g; loss += l; out.push(i === p ? 100 - 100 / (1 + gain / p / (loss / p || 1e-9)) : NaN); continue }
    gain = (gain * (p - 1) + g) / p
    loss = (loss * (p - 1) + l) / p
    out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss))
  }
  return out
}

export function macd(v: number[], f = 12, s = 26, sig = 9) {
  const ef = ema(v, f), es = ema(v, s)
  const line = v.map((_, i) => ef[i]! - es[i]!)
  const signal = ema(line, sig)
  const hist = line.map((m, i) => m - signal[i]!)
  return { line, signal, hist }
}

export function atr(c: Candle[], p = 14): number[] {
  const tr: number[] = [0]
  for (let i = 1; i < c.length; i++) {
    tr.push(Math.max(c[i]!.high - c[i]!.low, Math.abs(c[i]!.high - c[i - 1]!.close), Math.abs(c[i]!.low - c[i - 1]!.close)))
  }
  const out: number[] = []
  for (let i = 0; i < tr.length; i++) {
    if (i < p) { out.push(NaN); continue }
    if (i === p) { out.push(tr.slice(1, p + 1).reduce((a, b) => a + b, 0) / p); continue }
    out.push((out[i - 1]! * (p - 1) + tr[i]!) / p)
  }
  return out
}

export function bollinger(v: number[], p = 20, mult = 2) {
  const mid = sma(v, p)
  const up: number[] = [], dn: number[] = []
  for (let i = 0; i < v.length; i++) {
    if (i < p - 1) { up.push(NaN); dn.push(NaN); continue }
    let s = 0
    for (let j = i - p + 1; j <= i; j++) s += (v[j]! - mid[i]!) ** 2
    const sd = Math.sqrt(s / p)
    up.push(mid[i]! + mult * sd); dn.push(mid[i]! - mult * sd)
  }
  return { mid, up, dn }
}

/** سطوح کلیدی حمایت و مقاومت از سقف/کف آخرین N کندل */
export function levels(c: Candle[], look = 40): { support: number[]; resistance: number[] } {
  const w = c.slice(-look)
  const hi: number[] = [], lo: number[] = []
  for (let i = 2; i < w.length - 2; i++) {
    if (w[i]!.high >= w[i - 1]!.high && w[i]!.high >= w[i - 2]!.high && w[i]!.high >= w[i + 1]!.high && w[i]!.high >= w[i + 2]!.high) hi.push(w[i]!.high)
    if (w[i]!.low <= w[i - 1]!.low && w[i]!.low <= w[i - 2]!.low && w[i]!.low <= w[i + 1]!.low && w[i]!.low <= w[i + 2]!.low) lo.push(w[i]!.low)
  }
  const price = c[c.length - 1]!.close
  const dedupe = (a: number[]) => [...new Set(a.map((x) => Number(x.toFixed(4))))].sort((x, y) => y - x)
  return {
    resistance: dedupe(hi).filter((x) => x > price).slice(0, 3),
    support: dedupe(lo).filter((x) => x < price).reverse().slice(0, 3),
  }
}

/** الگوهای کلاسیک کندل */
export function patterns(c: Candle[]): string[] {
  const out: string[] = []
  const n = c.length
  const cur = c[n - 1]!, prev = c[n - 2]!
  const body = Math.abs(cur.close - cur.open)
  const range = cur.high - cur.low || 1e-9
  const upper = cur.high - Math.max(cur.open, cur.close)
  const lower = Math.min(cur.open, cur.close) - cur.low

  if (body / range < 0.1) out.push('دوجی (بی‌تصمیمی بازار)')
  if (lower > body * 2 && upper < body * 0.6 && cur.close > cur.open) out.push('چکش صعودی 🔨')
  if (upper > body * 2 && lower < body * 0.6 && cur.close < cur.open) out.push('ستارهٔ shootinگ (نگارش پایین‌رو) 📉')
  if (prev.close < prev.open && cur.close > cur.open && cur.close > prev.open && cur.open < prev.close) out.push('پوشای صعودی 🟢')
  if (prev.close > prev.open && cur.close < cur.open && cur.close < prev.open && cur.open > prev.close) out.push('پوشای نزولی 🔴')
  if (upper / range < 0.05 && lower / range < 0.05 && body / range > 0.7) out.push('ماروبوزو ' + (cur.close > cur.open ? 'صعودی' : 'نزولی'))
  return out
}

/** گزارش کامل اندیکاتورها — برای تزریق به AI */
export interface Analysis {
  price: number
  change24h: number
  trend: string
  ema9: number; ema21: number; ema50: number
  rsi14: number
  macdLine: number; macdSignal: number; macdHist: number
  bbUp: number; bbMid: number; bbDn: number
  atr14: number
  support: number[]; resistance: number[]
  avgVol: number; lastVol: number; volRatio: number
  swingHigh: number; swingLow: number
  patterns: string[]
  body: string
}

export function analyze(q: MarketQuote): Analysis {
  const c = q.candles
  const closes = c.map((x) => x.close)
  const last = c[c.length - 1]!
  const e9 = ema(closes, 9), e21 = ema(closes, 21), e50 = ema(closes, 50)
  const r = rsi(closes, 14)
  const m = macd(closes)
  const b = bollinger(closes)
  const a = atr(c, 14)
  const lv = levels(c)
  const vols = c.map((x) => x.volume)
  const avgVol = sma(vols, 20)[vols.length - 1] || 0

  const n = closes.length
  const trend =
    e9[n - 1]! > e21[n - 1]! && e21[n - 1]! > e50[n - 1]! ? 'صعودی قوی'
      : e9[n - 1]! > e21[n - 1]! ? 'صعودی'
        : e9[n - 1]! < e21[n - 1]! && e21[n - 1]! < e50[n - 1]! ? 'نزولی قوی'
          : 'نزولی'

  const f = (x: number, d = 2) => (Number.isFinite(x) ? Number(x.toFixed(d)) : NaN)
  const A: Analysis = {
    price: last.close,
    change24h: q.change24h,
    trend,
    ema9: f(e9[n - 1]!), ema21: f(e21[n - 1]!), ema50: f(e50[n - 1]!),
    rsi14: f(r[n - 1]!, 1),
    macdLine: f(m.line[n - 1]!, 4), macdSignal: f(m.signal[n - 1]!, 4), macdHist: f(m.hist[n - 1]!, 4),
    bbUp: f(b.up[n - 1]!), bbMid: f(b.mid[n - 1]!), bbDn: f(b.dn[n - 1]!),
    atr14: f(a[n - 1]!),
    support: lv.support, resistance: lv.resistance,
    avgVol: f(avgVol, 2), lastVol: f(last.volume, 2),
    volRatio: f(avgVol ? last.volume / avgVol : 0),
    swingHigh: f(Math.max(...c.slice(-40).map((x) => x.high))),
    swingLow: f(Math.min(...c.slice(-40).map((x) => x.low))),
    patterns: patterns(c),
    body: '',
  }

  // متن داده‌ها برای AI — دقیق و خوانا
  const tail = c.slice(-12)
  A.body = [
    `نماد: ${q.label} (${q.symbol}) · تایم‌فریم: ${q.timeframe} · منبع: ${q.source}`,
    q.note || '',
    `قیمت فعلی: ${f(last.close)} · تغییر: ${q.change24h.toFixed(2)}٪`,
    `روند: ${trend}`,
    `EMA9=${A.ema9} · EMA21=${A.ema21} · EMA50=${A.ema50}`,
    `RSI14=${A.rsi14}`,
    `MACD=${A.macdLine} · Signal=${A.macdSignal} · Hist=${A.macdHist}`,
    `بولینگر: بالا=${A.bbUp} · میانه=${A.bbMid} · پایین=${A.bbDn}`,
    `ATR14=${A.atr14} (نوسان میانگین)`,
    `مقاومت: ${A.resistance.length ? A.resistance.join(' ، ') : '—'}`,
    `حمایت: ${A.support.length ? A.support.join(' ، ') : '—'}`,
    `سقف ۴۰ کندل اخیر=${A.swingHigh} · کف=${A.swingLow}`,
    `حجم آخر=${A.lastVol} · میانگین=${A.avgVol} · نسبت=${A.volRatio}برابر`,
    A.patterns.length ? `الگوها: ${A.patterns.join(' · ')}` : 'الگوی خاصی دیده نشد',
    '',
    'آخرین ۱۲ کندل (زمان | باز | بالا | پایین | بسته | حجم):',
    ...tail.map((k) => {
      const d = new Date(k.time)
      const hh = String(d.getUTCHours()).padStart(2, '0')
      const mm = String(d.getUTCMinutes()).padStart(2, '0')
      return `  ${d.getUTCDate()}/${d.getUTCMonth() + 1} ${hh}:${mm} | ${f(k.open)} | ${f(k.high)} | ${f(k.low)} | ${f(k.close)} | ${f(k.volume, 1)}`
    }),
  ].join('\n')

  return A
}

/** فرمت قیمت خوانا */
export function fmtPrice(p: number): string {
  if (!Number.isFinite(p)) return '—'
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (p >= 1) return p.toFixed(3)
  return p.toFixed(6)
}
