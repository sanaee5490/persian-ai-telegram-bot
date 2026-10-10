/**
 * نقطهٔ ورود ربات تلگرامی «راهنما»
 * دستیار هوش مصنوعی فارسی — Node.js + grammY
 */
import fs from 'node:fs'
import path from 'node:path'
import { config, configIssues, ROOT_DIR } from './config.js'
import { bot, isAdmin } from './bot.js'
import { db, statsStore, upsertUser } from './db/database.js'
import { registerStartHandlers } from './handlers/start.js'
import { registerChatHandlers } from './handlers/chat.js'
import { registerAdminHandlers } from './handlers/admin.js'
import { registerTtsHandlers } from './handlers/tts.js'
import { registerToolHandlers } from './handlers/tools.js'
import { registerQuickHandlers } from './handlers/quick.js'
import { rateLimit } from './middleware/rateLimit.js'
import { startServer } from './web/server.js'
import { allModels, modelLabel, resolveDefaultModel } from './ai/index.js'
import { userStore } from './db/database.js'

const LOCK_FILE = path.join(ROOT_DIR, 'data', '.bot.lock')

function banner(): void {
  const line = '─'.repeat(46)
  console.log(`\n┌${line}┐`)
  console.log('│   🤖  راهنما — دستیار هوش مصنوعی تلگرام     │')
  console.log(`└${line}┘`)
}

function reportConfig(): void {
  const issues = configIssues()
  if (issues.length === 0) {
    console.log('✅ تمام تنظیمات کامل است.')
    return
  }
  console.log('\n📋 وضعیت تنظیمات:')
  for (const i of issues) {
    const icon = i.level === 'error' ? '❌' : '⚠️ '
    console.log(`  ${icon} ${i.message}`)
  }
  console.log('')
}

/** جلوگیری از اجرای هم‌زمان دو نمونه (تداخل در getUpdates) */
function acquireLock(): boolean {
  try {
    fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true })
    if (fs.existsSync(LOCK_FILE)) {
      const pid = Number(fs.readFileSync(LOCK_FILE, 'utf8').trim())
      if (Number.isFinite(pid) && pid > 0) {
        try {
          process.kill(pid, 0) // بررسی زنده بودن
          return false
        } catch {
          /* پروسهٔ قبلی مرده — قفل کهنه است */
        }
      }
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid))
    return true
  } catch {
    return true // اگر نتوانستیم قفل بگیریم، مانع نشو
  }
}

function releaseLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE)
  } catch {
    /* noop */
  }
}

let processedUpdates = 0
let failedUpdates = 0

async function main(): Promise<void> {
  banner()
  reportConfig()

  if (!acquireLock()) {
    console.error('❌ یک نمونهٔ دیگر از ربات در حال اجراست!')
    console.error('   برای جلوگیری از تداخل در دریافت پیام‌ها، این پروسه متوقف می‌شود.')
    console.error('   → اگر مطمئنی که‌کسی اجرا نکرده، فایل data/.bot.lock را حذف کن.')
    process.exit(1)
  }

  // دستورات ربات در منوی تلگرام
  try {
    await bot.api.setMyCommands([
      { command: 'start', description: '🏠 منوی اصلی' },
      { command: 'new', description: '🔄 پاک کردن حافظهٔ گفتگو' },
      { command: 'model', description: '🤖 تغییر مدل هوش مصنوعی' },
      { command: 'search', description: '🌐 جستجوی وب' },
      { command: 'stats', description: '📊 آمار شما' },
      { command: 'tts', description: '🔊 متن به صدا' },
      { command: 'voice', description: '🎙️ انتخاب صوت' },
      { command: 'tone', description: '🎚️ انتخاب لحن' },
      { command: 'humanize', description: '✍️ انسانی‌سازی متن' },
      { command: 'translate', description: '🌐 ترجمهٔ حرفه‌ای' },
      { command: 'summarize', description: '📝 خلاصه‌سازی' },
      { command: 'link', description: '🔗 خلاصه‌سازی لینک' },
      { command: 'ocr', description: '📄 خواندن سند' },
      { command: 'memory', description: '🧠 حافظهٔ من' },
      { command: 'help', description: '❓ راهنما' },
    ])
    console.log('📋 منوی دستورات تلگرام ثبت شد.')
  } catch (err) {
    console.warn('⚠️  ثبت منوی دستورات ناموفق:', err instanceof Error ? err.message : err)
  }

  // ---------- میان‌افزارها ----------
  bot.use(async (ctx, next) => {
    if (ctx.from) {
      upsertUser(ctx.from.id, ctx.from.username, ctx.from.first_name)
      userStore.touch(ctx.from.id)
    }
    processedUpdates++
    const kind =
      ctx.message?.text ? `متن: "${ctx.message.text.slice(0, 30)}"` :
      ctx.message?.voice ? 'ویس' :
      ctx.message?.photo ? 'عکس' :
      ctx.callbackQuery ? `دکمه: ${ctx.callbackQuery.data}` :
      Object.keys(ctx.update)[1] ?? 'سایر'
    console.log(`📩 [${processedUpdates}] ${kind} — از ${ctx.from?.id ?? '?'}`)
    const t0 = Date.now()
    try {
      await next()
      console.log(`   ✅ پردازش شد (${Date.now() - t0}ms)`)
    } catch (err) {
      failedUpdates++
      console.error(`   ❌ خطا در پردازش:`, err instanceof Error ? err.message : err)
      throw err
    }
  })
  bot.use(rateLimit)

  // ---------- هندلرها ----------
  registerStartHandlers(bot)
  registerQuickHandlers(bot)
  registerChatHandlers(bot)
  registerAdminHandlers(bot)
  registerTtsHandlers(bot)
  registerToolHandlers(bot)

  // ---------- سرور وب ----------
  startServer()

  // ---------- اجرای ربات ----------
  console.log(`🧠 ارائه‌دهنده: ${modelLabel(resolveDefaultModel())}`)
  console.log(`👥 کاربران ثبت‌شده: ${statsStore.totalUsers()}`)
  console.log(`🗄  دیتابیس: ${config.dbPath}`)

  if (config.demoMode) {
    console.log('\n⏸  حالت آماده‌سازی (توکن ربات وارد نشده)')
    console.log('   → داشبورد وب در حال اجراست و آمادهٔ اتصال است.')
    console.log('   → برای فعال‌سازی: فایل .env بسازید و BOT_TOKEN را پر کنید.\n')
    return
  }

  console.log('\n🚀 ربات در حال اجراست... (Ctrl+C برای توقف)\n')

  // heartbeat برای اطمینان از زنده بودن حلقه
  const hb = setInterval(() => {
    console.log(
      `💓 زنده — آپدیت‌ها: ${processedUpdates} پردازش‌شده، ${failedUpdates} خطا، ` +
        `کاربران: ${statsStore.totalUsers()}`,
    )
  }, 5 * 60 * 1000)
  hb.unref()

  // در زمان دیپلوی، نمونهٔ قدیمی هنوز poll می‌کند و خطای 409 می‌دهد.
  // چند بار با فاصله تلاش می‌کنیم تا ربات خاموش نماند.
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await bot.start({
        onStart: (info) => {
          console.log(`✅ متصل شد به @${info.username} — منتظر پیام...`)
        },
      })
      break
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const conflict = /409|Conflict|getUpdates/i.test(msg)
      if (!conflict || attempt === 5) throw err
      const wait = attempt * 8000
      console.warn(`⚠️  تداخل با نمونهٔ قبلی (${attempt}/۵) — ${wait / 1000} ثانیه بعد دوباره...`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  clearInterval(hb)
}

// خروج تمیز
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log('\n👋 در حال خروج...')
    try {
      bot.stop()
    } catch {
      /* noop */
    }
    try {
      db.close()
    } catch {
      /* noop */
    }
    releaseLock()
    process.exit(0)
  })
}

process.on('unhandledRejection', (reason) => {
  console.error('⚠️  خطای مدیریت‌نشده:', reason)
})

process.on('exit', releaseLock)

main().catch((err) => {
  console.error('❌ خطای راه‌اندازی:', err)
  releaseLock()
  process.exit(1)
})
