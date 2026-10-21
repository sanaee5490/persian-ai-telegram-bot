/**
 * تحلیل بازار مالی — مثل یک تریدر حرفه‌ای.
 *
 * جریان کار:
 *   ۱) گرفتن کندل از OKX/Kraken/Coinbase
 *   ۲) محاسبهٔ اندیکاتورها (EMA · RSI · MACD · بولینگر · ATR · S/R)
 *   ۳) رندر چارت کندلی حرفه‌ای به PNG
 *   ۴) فرستادن چارت + داده‌های دقیق به Gemini Vision
 *   ۵) تحلیلی با ساختار مشخص: جهت · نقاط ورود · حد ضرر · حد سود
 */
import { Context } from 'grammy'
import { InputFile } from 'grammy'
import type { Bot } from 'grammy'
import { getQuote, analyze, fmtPrice, SYMBOLS, TIMEFRAMES, type MarketQuote, type Analysis } from '../ai/market.js'
import { renderChart } from '../services/chart.js'
import { chat } from '../ai/index.js'
import { startTyping } from '../utils/telegram.js'
import { sendLong } from '../utils/text.js'
import { getUser } from '../db/database.js'
import { t } from '../i18n/fa.js'

/* ── پرامپت تحلیل حرفه‌ای ───────────────────────────── */

const SYSTEM = `تو یک تحلیلگر حرفه‌ای بازارهای مالی با ۲۰ سال تجربه هستی.
تحلیل فنی دقیق، بی‌طرف و ریسک‌محور انجام می‌دهی.

قواعد سخت‌گیرانه:
- هیچ‌وقت تضمین سود نده. هیچ‌وقت نگو «حتماً می‌رود».
- داده با تأخیر یا تعطیلی بازار را زنده معرفی نکن. حجم صفر را ناموجود بدان. کندل باز تأیید الگو نیست.
- درصد احتمال یا اطمینان بدون مدل کالیبره و بک‌تست نساز؛ جهت را کیفی بیان کن.
- همیشه احتمال ضرر را هم بنویس.
- اعداد را از داده‌های داده‌شده بردار، حدس نزن.
- به فارسی و ساده بنویس. از ایموجی برای ساختار استفاده کن.
- حداکثر ۴۵۰ کلمه. کوتاه و پرکشش.`

const PROMPT = (q: MarketQuote, a: Analysis) => `این چارت ${q.label} (${q.symbol}) در تایم‌فریم ${q.timeframe} را تحلیل کن.

داده‌های دقیق محاسبه‌شده:
${a.body}

الگوهای شناسایی‌شده: ${a.patterns.length ? a.patterns.join(' · ') : 'هیچ'}

دقیقاً با این ساختار جواب بده (هر بخش را با همان ایموجی شروع کن):

📊 **رأی کلی**
یک خط: صعودی / نزولی / خنثی — با توضیح کیفی قدرت شواهد؛ بدون درصد ساختگی.

🔍 **تحلیل تکنیکال**
۳ تا ۴ جمله: روند، وضعیت EMAها، RSI (اشباع خرید/فروش)، MACD، موقعیت نسبت به بولینگر و حجم.

🎯 **سطوح کلیدی**
• مقاومت نزدیک: عدد
• حمایت نزدیک: عدد

✅ **سناریوی ورود**
اگر معامله worthwhile بود، نقطهٔ ورود منطقی چنده؟ اگر نیست، بنویس «ورود توصیه نمی‌شود».

🛑 **حد ضرر**
عدد دقیق + دلیل کوتاه (مثلاً زیر حمایت X).

💰 **اهداف قیمتی**
هدف ۱ و هدف ۲ با اعداد.

⚠️ **هشدار ریسک**
یک جملهٔ صادقانه دربارهٔ ریسک این معامله.`

/* ── تحلیل ──────────────────────────────────────────── */

export interface MarketReport {
  quote: MarketQuote
  analysis: Analysis
  png: Buffer
  text: string
  provider: string
}

export async function buildReport(symbol: string, timeframe: string): Promise<MarketReport> {
  const quote = await getQuote(symbol, timeframe)
  const analysis = analyze(quote)

  const png = renderChart({
    symbol: quote.symbol, label: quote.label, timeframe: quote.timeframe,
    candles: quote.candles, analysis, source: quote.source,
  })

  let text = ''
  let provider = '—'
  try {
    const r = await chat('gemini-3.8-flash', {
      system: SYSTEM,
      messages: [
        { role: 'user', content: PROMPT(quote, analysis), images: [{ mimeType: 'image/png', data: png.toString('base64') }] },
      ],
      temperature: 0.4,
      maxTokens: 2048,
    })
    text = r.text
    provider = r.provider
  } catch (err) {
    // اگر AI جواب نداد، گزارش عددی نشان بده — بهتر از هیچ
    const a = analysis
    text = [
      `📊 **${quote.label} · ${quote.timeframe}**`, '',
      `💰 قیمت: **$${fmtPrice(a.price)}** · ${a.change24h >= 0 ? '▲' : '▼'} ${Math.abs(a.change24h).toFixed(2)}٪`,
      `🧭 روند: **${a.trend}**`, '',
      '📐 **اندیکاتورها**',
      `• RSI14: ${a.rsi14}${a.rsi14 > 70 ? ' (اشباع خرید)' : a.rsi14 < 30 ? ' (اشباع فروش)' : ''}`,
      `• MACD هیستوگرام: ${a.macdHist >= 0 ? '+' : ''}${a.macdHist}`,
      `• EMA9/21/50: ${a.ema9} / ${a.ema21} / ${a.ema50}`,
      `• ATR14 (نوسان): ${a.atr14}`,
      `• نسبت حجم به میانگین: ${a.volRatio}×`, '',
      '🎯 **سطوح کلیدی**',
      `• مقاومت: ${a.resistance.map((r) => fmtPrice(r)).join(' · ') || '—'}`,
      `• حمایت: ${a.support.map((r) => fmtPrice(r)).join(' · ') || '—'}`,
      a.patterns.length ? `\n🕯️ **الگوها:** ${a.patterns.join(' · ')}` : '',
      '',
      `⚠️ تحلیل متنی در دسترس نبود (${(err as Error).message.slice(0, 60)}). اعداد بالا دقیق‌اند.`,
    ].join('\n')
  }

  return { quote, analysis, png, text, provider }
}

/* ── کیبوردها ───────────────────────────────────────── */

export function marketSymbolKeyboard() {
  const rows = Object.entries(SYMBOLS).map(([k, v]) => ({
    text: `${v.label}`,
    callback_data: `mkt:tf:${k}`,
  }))
  const grid = []
  for (let i = 0; i < rows.length; i += 2) grid.push(rows.slice(i, i + 2))
  return { inline_keyboard: grid }
}

export function marketTfKeyboard(sym: string) {
  const meta = SYMBOLS[sym]!
  return {
    inline_keyboard: [
      Object.entries(TIMEFRAMES).slice(0, 2).map(([k, v]) => ({
        text: v.label, callback_data: `mkt:run:${sym}:${k}`,
      })),
      Object.entries(TIMEFRAMES).slice(2, 4).map(([k, v]) => ({
        text: v.label, callback_data: `mkt:run:${sym}:${k}`,
      })),
      [{ text: '↩️ انتخاب نماد دیگر', callback_data: 'mkt:list' }],
    ],
  }
}

/* ── هندلر ──────────────────────────────────────────── */

export function registerMarketHandlers(bot: Bot): void {

  // /market یا /chart
  const entry = async (ctx: Context, arg: string) => {
    if (arg) {
      // /market BTC 1h
      const parts = arg.trim().split(/\s+/)
      const sym = parts[0]!.toUpperCase()
      const tf = parts[1]?.toLowerCase()
      if (!SYMBOLS[sym]) {
        await ctx.reply(
          `⚠️ نماد \`${sym}\` شناخته نشد.\n\nنمادهای موجود: ${Object.keys(SYMBOLS).join(' · ')}`,
          { parse_mode: 'Markdown' },
        )
        return
      }
      if (tf && !TIMEFRAMES[tf]) {
        await ctx.reply(`⚠️ تایم‌فریم \`${tf}\` درست نیست. یکی از: ${Object.keys(TIMEFRAMES).join(' · ')}`)
        return
      }
      await runMarket(ctx, sym, tf || '1h')
      return
    }
    await showSymbols(ctx)
  }

  bot.command('market', async (ctx) => { await entry(ctx, (ctx.match as string) || '') })
  bot.command('chart', async (ctx) => { await entry(ctx, (ctx.match as string) || '') })

  bot.callbackQuery(/^mkt:list$/, async (ctx) => {
    await ctx.answerCallbackQuery()
    await ctx.editMessageText('📈 **بازار مالی**\n\nکدام نماد را تحلیل کنم؟', {
      parse_mode: 'Markdown',
      reply_markup: marketSymbolKeyboard(),
    })
  })

  bot.callbackQuery(/^mkt:tf:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery()
    const sym = ctx.match[1]!
    await ctx.editMessageText(`📈 **${SYMBOLS[sym]?.label ?? sym}**\n\nکدام تایم‌فریم؟`, {
      parse_mode: 'Markdown',
      reply_markup: marketTfKeyboard(sym),
    })
  })

  bot.callbackQuery(/^mkt:run:([A-Z]+):(\w+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('⏳ در حال گرفتن داده و تحلیل…')
    const [, sym, tf] = ctx.match
    await runMarket(ctx, sym!, tf!, true)
  })

  // دکمهٔ منوی سریع
  bot.hears('📈 بازار مالی', async (ctx) => { await showSymbols(ctx) })
}

async function showSymbols(ctx: Context): Promise<void> {
  await ctx.reply(
    '📈 **بازار مالی**\n\nکدام نماد را تحلیل کنم؟\n\n_یا مستقیم بنویس:_ `/market BTC 1h`',
    { parse_mode: 'Markdown', reply_markup: marketSymbolKeyboard() },
  )
}

async function runMarket(ctx: Context, sym: string, tf: string, fromCallback = false): Promise<void> {
  const stop = startTyping(ctx.chat!.id)
  let status: unknown
  try {
    if (fromCallback) {
      status = await ctx.editMessageText(`⏳ **${SYMBOLS[sym]?.label}** · ${TIMEFRAMES[tf]?.label}\n\nدر حال گرفتن کندل‌ها و محاسبهٔ اندیکاتورها…`, { parse_mode: 'Markdown' })
    }

    const rep = await buildReport(sym, tf)

    if (!rep.png.length) {
      await ctx.reply(rep.text, { parse_mode: 'Markdown' })
      return
    }

    // چارت
    await ctx.replyWithPhoto(
      new InputFile(rep.png, `chart-${sym}-${tf}.png`),
      { caption: `📊 ${rep.quote.label} · ${rep.quote.timeframe} · ${rep.quote.source}` },
    )

    if (rep.quote.note) await ctx.reply(`ℹ️ ${rep.quote.note}`)

    // تحلیل تریدر
    const footer = `\n\n_🔎 تحلیل ${rep.provider} · داده: ${rep.quote.source}_\n_⚠️ این تحلیل جنبهٔ آموزشی دارد و توصیهٔ سرمایه‌گذاری نیست._`
    await sendLong((chunk) => ctx.reply(chunk, { parse_mode: 'Markdown' }), rep.text + footer)

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await ctx.reply(`⚠️ **تحلیل انجام نشد**\n\n\`${msg.slice(0, 200)}\`\n\nممکن است منبع داده موقتاً در دسترس نباشد. بعداً امتحان کن.`, { parse_mode: 'Markdown' })
  } finally {
    stop()
  }
}
