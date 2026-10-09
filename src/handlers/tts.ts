import type { Bot } from 'grammy'
import { InputFile } from 'grammy'
import { t } from '../i18n/fa.js'
import { getUser, upsertUser, userStore } from '../db/database.js'
import {
  DEFAULT_STYLE,
  DEFAULT_VOICE,
  TTS_STYLES,
  TTS_VOICES,
  styleById,
  styleLabel,
  synthesize,
  voiceByName,
  voiceLabel,
  voicesByGender,
} from '../ai/tts.js'
import {
  backKeyboard,
  closeKeyboard,
  speakKeyboard,
  tonesKeyboard,
  voiceGenderKeyboard,
  voicesKeyboard,
  voicesTitle,
} from '../keyboards/menus.js'
import { startTyping } from '../utils/telegram.js'

/** آخرین پاسخ متنی هر کاربر — برای دکمهٔ «بخوان» */
const lastReply = new Map<number, string>()

export function rememberReply(userId: number, text: string): void {
  lastReply.set(userId, text.slice(0, 1200))
  if (lastReply.size > 500) {
    const oldest = lastReply.keys().next().value
    if (oldest !== undefined) lastReply.delete(oldest)
  }
}

function userVoice(id: number): string {
  const v = getUser(id)?.voice || DEFAULT_VOICE
  return voiceByName(v) ? v : DEFAULT_VOICE
}

function userTone(id: number): string {
  const s = getUser(id)?.tone || DEFAULT_STYLE
  return styleById(s) ? s : DEFAULT_STYLE
}

interface SpeechCtx {
  chatId: number
  reply: (text: string, other?: object) => Promise<unknown>
  replyWithAudio: (audio: InputFile, other?: object) => Promise<unknown>
}

/** کانتکست واقعی grammY را به شکل سادهٔ قابل‌استفاده تبدیل می‌کند */
function asSpeechCtx(ctx: {
  chat?: { id: number }
  reply: (text: string, other?: object) => Promise<unknown>
}): SpeechCtx | undefined {
  if (!ctx.chat) return undefined
  const raw = ctx as unknown as {
    replyWithAudio: (a: InputFile, o?: object) => Promise<unknown>
  }
  return {
    chatId: ctx.chat.id,
    reply: ctx.reply.bind(ctx),
    replyWithAudio: (audio, other) => raw.replyWithAudio(audio, other),
  }
}

/** تولید و ارسال صدا */
async function sendSpeech(ctx: SpeechCtx, userId: number, text: string): Promise<void> {
  const stop = startTyping(ctx.chatId)
  try {
    const { data } = await synthesize(text, userVoice(userId), userTone(userId))
    stop()
    await ctx.reply('🔊 گوش کن:', { reply_markup: closeKeyboard() })
    await ctx.replyWithAudio(new InputFile(data, 'rahna.ogg'), {
      title: 'پاسخ راهنما',
      performer: `${voiceLabel(userVoice(userId))} · ${styleLabel(userTone(userId))}`,
    })
  } catch (err) {
    stop()
    const msg = err instanceof Error ? err.message : String(err)
    console.error('TTS خطا:', msg)
    await ctx.reply(`⚠️ تولید صدا ناموفق بود:\n${msg.slice(0, 200)}`)
  }
}

export function registerTtsHandlers(bot: Bot): void {
  // ---------- /tts <متن> ----------
  bot.command('tts', async (ctx) => {
    const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    const text = ctx.message?.text?.replace(/^\/tts\s*/, '').trim() ?? ''
    if (!text) {
      await ctx.reply(
        [
          '🔊 **متن به صدا**',
          '',
          'متن خودت را با این دستور بفرست:',
          '`/tts سلام، امروز روز خوبی است`',
          '',
          `🎙️ صوت فعلی: **${voiceLabel(user.voice || DEFAULT_VOICE)}**`,
          `🎚️ لحن فعلی: **${styleLabel(user.tone || DEFAULT_STYLE)}**`,
          '',
          'برای تغییر صوت: `/voice`',
          'برای تغییر لحن: `/tone`',
        ].join('\n'),
        { reply_markup: backKeyboard() },
      )
      return
    }
    const sc = asSpeechCtx(ctx)
    if (sc) await sendSpeech(sc, user.telegram_id, text)
  })

  // ---------- /voice → مرحلهٔ ۱: جنسیت ----------
  bot.command('voice', async (ctx) => {
    const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    await ctx.reply(
      [
        '🎙️ **انتخاب صوت**',
        '',
        `فعلی: **${voiceLabel(user.voice || DEFAULT_VOICE)}**`,
        '',
        'اول جنسیت صدا را انتخاب کن:',
      ].join('\n'),
      { reply_markup: voiceGenderKeyboard() },
    )
  })

  // ---------- /tone ----------
  bot.command('tone', async (ctx) => {
    const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    await ctx.reply(
      [
        '🎚️ **انتخاب لحن**',
        '',
        TTS_STYLES.map((s) => `• ${s.label}`).join('\n'),
        '',
        `فعلی: **${styleLabel(user.tone || DEFAULT_STYLE)}**`,
      ].join('\n'),
      { reply_markup: tonesKeyboard(user.tone || DEFAULT_STYLE) },
    )
  })

  // ---------- دکمهٔ 🔊 بخوان زیر پاسخ‌ها ----------
  bot.callbackQuery('tts:last', async (ctx) => {
    const userId = ctx.from!.id
    const text = lastReply.get(userId)
    if (!text) {
      await ctx.answerCallbackQuery('اول یه پیام بفرست تا بخونم').catch(() => {})
      return
    }
    await ctx.answerCallbackQuery('🔊 دارم می‌خونم...').catch(() => {})
    const sc = asSpeechCtx(ctx)
    if (sc) await sendSpeech(sc, userId, text)
  })

  // ---------- انتخاب صوت ----------
  bot.callbackQuery(/^ttsvoice:/, async (ctx) => {
    const name = ctx.callbackQuery!.data.split(':')[1]!
    const v = voiceByName(name)
    if (!v) {
      await ctx.answerCallbackQuery('صوت نامعتبر').catch(() => {})
      return
    }
    const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    userStore.setVoice(user.telegram_id, name)
    await ctx.answerCallbackQuery(`✅ ${v.label}`).catch(() => {})
    await ctx
      .editMessageText(
        [
          '🎙️ **انتخاب صوت**',
          '',
          `✅ فعال شد: **${v.label}**`,
          `📝 ${v.desc}`,
          '',
          'حالا `/tts متن شما` را بفرست تا بشنوی.',
        ].join('\n'),
        { reply_markup: voicesKeyboard(name) },
      )
      .catch(() => {})
  })

  // ---------- انتخاب لحن ----------
  bot.callbackQuery(/^ttstone:/, async (ctx) => {
    const id = ctx.callbackQuery!.data.split(':')[1]!
    const s = styleById(id)
    if (!s) {
      await ctx.answerCallbackQuery('لحن نامعتبر').catch(() => {})
      return
    }
    const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    userStore.setTone(user.telegram_id, id)
    await ctx.answerCallbackQuery(`✅ ${s.label}`).catch(() => {})
    await ctx
      .editMessageText(
        [
          '🎚️ **انتخاب لحن**',
          '',
          `✅ فعال شد: **${s.label}**`,
          '',
          'حالا `/tts متن شما` را بفرست تا بشنوی.',
        ].join('\n'),
        { reply_markup: tonesKeyboard(id) },
      )
      .catch(() => {})
  })

  // ---------- ناوبری از منوی تنظیمات ----------
  bot.callbackQuery('nav:voices', async (ctx) => {
    const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    await ctx
      .editMessageText(
        [
          t.settings.voiceTitle,
          '',
          `فعلی: **${voiceLabel(user.voice || DEFAULT_VOICE)}**`,
          '',
          'اول جنسیت صدا را انتخاب کن:',
        ].join('\n'),
        { reply_markup: voiceGenderKeyboard() },
      )
      .catch(() => {})
  })

  // ---------- فهرست صداهای یک جنسیت ----------
  for (const g of ['f', 'm'] as const) {
    bot.callbackQuery(`nav:voices_${g}`, async (ctx) => {
      const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
      await ctx
        .editMessageText(
          [
            voicesTitle(g),
            '',
            voicesByGender(g)
              .map((v) => `${v.name === user.voice ? '✅' : '•'} ${v.label} — ${v.desc}`)
              .join('\n'),
          ].join('\n'),
          { reply_markup: voicesKeyboard(user.voice || DEFAULT_VOICE, g) },
        )
        .catch(() => {})
    })
  }

  bot.callbackQuery('nav:tones', async (ctx) => {
    const user = upsertUser(ctx.from!.id, ctx.from!.username, ctx.from!.first_name)
    await ctx
      .editMessageText(
        [
          t.settings.toneTitle,
          '',
          TTS_STYLES.map((s) => `• ${s.label}`).join('\n'),
          '',
          `فعلی: **${styleLabel(user.tone || DEFAULT_STYLE)}**`,
        ].join('\n'),
        { reply_markup: tonesKeyboard(user.tone || DEFAULT_STYLE) },
      )
      .catch(() => {})
  })
}

export { lastReply }
