import type { Bot, Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { t } from '../i18n/fa.js'
import { config } from '../config.js'
import { historyStore, statsStore, upsertUser, userStore } from '../db/database.js'
import { isAdmin } from '../bot.js'
import {
  backKeyboard,
  closeKeyboard,
  creativityKeyboard,
  mainMenuKeyboard,
  modelsKeyboard,
  personasKeyboard,
  settingsKeyboard,
} from '../keyboards/menus.js'
import { formatDate, toPersianDigits } from '../utils/text.js'
import { userModelInfo } from '../services/assistant.js'
import { styleLabel, voiceLabel } from '../ai/tts.js'
import { toolsKeyboard, mainReplyKeyboard } from '../keyboards/menus.js'
import { memoryStore } from '../db/database.js'

/** ثبت/به‌روزرسانی کاربر و نمایش منوی اصلی */
export async function showMainMenu(ctx: Context, edit = false): Promise<void> {
  const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
  const text = `${t.welcome(ctx.from!.first_name || 'دوست')}\n\n${t.menu.main}`
  const kb = mainMenuKeyboard()
  if (edit) {
    await ctx.editMessageText(text, { reply_markup: kb }).catch(async () => {
      await ctx.reply(text, { reply_markup: kb })
    })
  } else {
    await ctx.reply(text, { reply_markup: kb })
  }
  // کیبورد دائمی پایین صفحهٔ تایپ (شامل دکمهٔ مینی‌اپ)
  await ctx.reply('⌨️ منوی سریع:', { reply_markup: mainReplyKeyboard() }).catch(() => {})
}

export function registerStartHandlers(bot: Bot): void {
  bot.command('start', async (ctx) => {
    upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    await showMainMenu(ctx)
  })

  bot.command('help', async (ctx) => {
    await ctx.reply(t.help, { reply_markup: backKeyboard() })
  })

  bot.command('new', async (ctx) => {
    historyStore.clear(ctx.from!.id)
    await ctx.reply(t.newChat, { reply_markup: closeKeyboard() })
  })

  bot.command('model', async (ctx) => {
    const user = upsertUser(ctx.from!.id)
    const current = user.model || userModelInfo(ctx.from!.id).id
    await ctx.reply(t.model.title, { reply_markup: modelsKeyboard(current) })
  })

  bot.command('stats', async (ctx) => {
    const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    const model = userModelInfo(user.telegram_id)
    await ctx.reply(
      t.stats({
        messages: user.msg_count,
        images: user.image_count,
        voices: user.voice_count,
        searches: user.search_count,
        since: formatDate(user.created_at),
        model: model.label,
      }),
      { reply_markup: backKeyboard() },
    )
  })

  bot.command('about', async (ctx) => {
    await ctx.reply(t.about, { reply_markup: backKeyboard() })
  })

  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply(t.adminOnly)
      return
    }
    const totals = statsStore.totals()
    await ctx.reply(
      [
        '🛠 **پنل مدیریت**',
        '',
        `👥 کاربران: **${toPersianDigits(statsStore.totalUsers())}**`,
        `💬 پیام‌های ذخیره‌شده: **${toPersianDigits(statsStore.totalMessages())}**`,
        `🟢 فعالان امروز: **${toPersianDigits(statsStore.activeToday())}**`,
        `📨 پیام‌های پردازش‌شده: **${toPersianDigits(totals.msg)}**`,
        '',
        'دستورات مدیریت:',
        '/broadcast <متن> — ارسال پیام به همه',
        '/ban <آیدی> — محروم کردن کاربر',
        '/unban <آیدی> — آزاد کردن کاربر',
        '/users — فهرست آخرین کاربران',
      ].join('\n'),
    )
  })

  // ---------- ناوبری منوها ----------
  bot.callbackQuery(/^nav:/, async (ctx, next) => {
    const target = ctx.callbackQuery!.data.replace('nav:', '')
    const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    await ctx.answerCallbackQuery().catch(() => {})

    switch (target) {
      case 'main':
        await showMainMenu(ctx, true)
        break
      case 'new':
        historyStore.clear(user.telegram_id)
        await ctx.editMessageText(t.newChat, { reply_markup: closeKeyboard() }).catch(() => {})
        break
      case 'models':
        await ctx
          .editMessageText(t.model.title, { reply_markup: modelsKeyboard(user.model || userModelInfo(user.telegram_id).id) })
          .catch(() => {})
        break
      case 'settings':
        await ctx.editMessageText(t.settings.title, { reply_markup: settingsKeyboard() }).catch(() => {})
        break
      case 'personas':
        await ctx
          .editMessageText(t.settings.personaTitle, { reply_markup: personasKeyboard(user.persona) })
          .catch(() => {})
        break
      case 'creativity':
        await ctx
          .editMessageText(t.settings.creativityTitle, {
            reply_markup: creativityKeyboard(user.temperature >= 0 ? user.temperature : config.temperature),
          })
          .catch(() => {})
        break
      case 'stats':
        await ctx
          .editMessageText(
            t.stats({
              messages: user.msg_count,
              images: user.image_count,
              voices: user.voice_count,
              searches: user.search_count,
              since: formatDate(user.created_at),
              model: userModelInfo(user.telegram_id).label,
            }),
            { reply_markup: backKeyboard() },
          )
          .catch(() => {})
        break
      case 'help':
        await ctx.editMessageText(t.help, { reply_markup: backKeyboard() }).catch(() => {})
        break
      case 'about':
        await ctx.editMessageText(t.about, { reply_markup: backKeyboard() }).catch(() => {})
        break
      case 'search': {
        const kb = new InlineKeyboard().text(t.menu.back, 'nav:main')
        await ctx
          .editMessageText(
            '🌐 **جستجوی وب رایگان**\n\nسوال خود را با دستور زیر بفرستید:\n\n`/search متن سوال شما`\n\nمثال:\n`/search قیمت دلار امروز`',
            { reply_markup: kb },
          )
          .catch(() => {})
        break
      }
      case 'tts': {
        const kb = new InlineKeyboard()
          .text('🔊 متن بده', 'noop')
          .text('🎙️ صوت', 'nav:voices')
          .row()
          .text('🎚️ لحن', 'nav:tones')
          .text(t.menu.back, 'nav:main')
        await ctx
          .editMessageText(
            [
              '🔊 **متن به صدا**',
              '',
              'هر متنی رو با این دستور بفرست تا برات بخونم:',
              '`/tts سلام، امروز روز خوبی است`',
              '',
              `🎙️ صوت فعلی: **${voiceLabel(user.voice || 'Kore')}**`,
              `🎚️ لحن فعلی: **${styleLabel(user.tone || 'normal')}**`,
              '',
              'یا روی دکمهٔ 🔊 **بخوان** زیر هر پاسخم بزن.',
            ].join('\n'),
            { reply_markup: kb },
          )
          .catch(() => {})
        break
      }
      case 'market': {
        const m = await import('./market.js')
        await ctx
          .editMessageText(
            '📈 **بازار مالی**\n\nکدام نماد را تحلیل کنم؟\n\n_یا مستقیم بنویس:_ `/market BTC 1h`',
            { parse_mode: 'Markdown', reply_markup: m.marketSymbolKeyboard() },
          )
          .catch(() => {})
        break
      }
      case 'tools': {
        await ctx
          .editMessageText(t.tools.title, { reply_markup: toolsKeyboard() })
          .catch(() => {})
        break
      }
      case 'memory': {
        const all = memoryStore.all(user.telegram_id)
        await ctx
          .editMessageText(
            all.length === 0
              ? t.tools.empty
              : [
                  `🧠 **چیزهایی که دربارهٔ تو می‌دانم** (${all.length})`,
                  '',
                  ...all.slice(0, 25).map((m) => `• ${m.content}`),
                  '',
                  '`/memory clear` — پاک کردن همه',
                ].join('\n'),
            { reply_markup: backKeyboard() },
          )
          .catch(() => {})
        break
      }
      case 'close':
        await ctx.deleteMessage().catch(() => {})
        break
      default:
        await next()
    }
  })

  // ---------- انتخاب مدل ----------
  bot.callbackQuery(/^model:/, async (ctx) => {
    const [, provider, modelId] = ctx.callbackQuery!.data.split(':')
    const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    userStore.setModel(user.telegram_id, modelId!)
    await ctx.answerCallbackQuery('✅ مدل تغییر کرد').catch(() => {})
    const label = userModelInfo(user.telegram_id).label
    await ctx
      .editMessageText(`${t.model.changed(label)}\n\n${t.menu.main}`, { reply_markup: mainMenuKeyboard() })
      .catch(() => {})
  })

  // ---------- انتخاب شخصیت ----------
  bot.callbackQuery(/^persona:/, async (ctx) => {
    const personaId = ctx.callbackQuery!.data.split(':')[1]!
    const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    userStore.setPersona(user.telegram_id, personaId)
    const persona = t.personas.find((p) => p.id === personaId)
    await ctx.answerCallbackQuery(`✅ ${persona?.label ?? ''}`).catch(() => {})
    await ctx
      .editMessageText(`${t.settings.personaTitle}\n\n✅ فعال: ${persona?.label ?? personaId}`, {
        reply_markup: personasKeyboard(personaId),
      })
      .catch(() => {})
  })

  // ---------- سطح خلاقیت ----------
  bot.callbackQuery(/^temp:/, async (ctx) => {
    const value = Number(ctx.callbackQuery!.data.split(':')[1])
    const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    userStore.setTemperature(user.telegram_id, value)
    await ctx.answerCallbackQuery('✅ ذخیره شد').catch(() => {})
    await ctx
      .editMessageText(t.settings.creativitySet(value), { reply_markup: creativityKeyboard(value) })
      .catch(() => {})
  })

  bot.callbackQuery('settings:reset', async (ctx) => {
    const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    userStore.reset(user.telegram_id)
    await ctx.answerCallbackQuery('♻️ بازنشانی شد').catch(() => {})
    await ctx.editMessageText(t.settings.resetDone, { reply_markup: settingsKeyboard() }).catch(() => {})
  })

  bot.callbackQuery('noop', async (ctx) => {
    await ctx.answerCallbackQuery('این گزینه به‌زودی فعال می‌شود ✨').catch(() => {})
  })
}
