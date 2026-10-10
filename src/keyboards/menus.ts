import { InlineKeyboard, Keyboard } from 'grammy'
import { t } from '../i18n/fa.js'
import { allModels, modelLabel } from '../ai/index.js'
import { TTS_STYLES, TTS_VOICES, voicesByGender } from '../ai/tts.js'
import { config } from '../config.js'

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(t.menu.newChat, 'nav:new')
    .text(t.menu.model, 'nav:models')
    .row()
    .text(t.menu.settings, 'nav:settings')
    .text(t.menu.stats, 'nav:stats')
    .row()
    .text('🔊 متن به صدا', 'nav:tts')
    .text('🌐 جستجوی وب', 'nav:search')
    .row()
    .text('🧰 ابزارها', 'nav:tools')
    .text('🧠 حافظه', 'nav:memory')
    .row()
    .text(t.menu.help, 'nav:help')
    .text(t.menu.about, 'nav:about')
}

/** منوی ابزارها */
export function toolsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✍️ انسانی‌سازی', 'tool:humanize')
    .text('🌐 ترجمه', 'tool:translate')
    .row()
    .text('📝 خلاصه‌سازی', 'tool:summarize')
    .text('🔗 خلاصهٔ لینک', 'tool:link')
    .row()
    .text('📄 خواندن سند', 'tool:ocr')
    .text('🔊 متن به صدا', 'nav:tts')
    .row()
    .text(t.menu.back, 'nav:main')
}

/** آدرس مینی‌اپ (فقط https کار می‌کند) */
export function miniAppUrl(): string | undefined {
  const u = config.publicUrl.replace(/\/$/, '')
  if (!u.startsWith('https://')) return undefined
  return `${u}/miniapp`
}

/**
 * کیبورد دائمی پایین صفحهٔ تایپ
 * شامل دکمهٔ مینی‌اپ که مستقیماً از قسمت تایپ باز می‌شود
 */
export function mainReplyKeyboard(): Keyboard {
  const kb = new Keyboard()
    .text('💬 چت جدید')
    .text('🔊 متن به صدا')
    .row()
    .text('🧰 ابزارها')
    .text('🌐 جستجو')
    .row()
    .text('🧠 حافظه')
    .text('❓ راهنما')

  const url = miniAppUrl()
  if (url) kb.row().webApp('📱 مینی‌اپ', url)

  return kb.resized().persistent()
}

export function modelsKeyboard(currentModel: string): InlineKeyboard {
  const kb = new InlineKeyboard()
  const models = allModels()
  models.forEach(({ provider, model }, i) => {
    const mark = model.id === currentModel ? '✅ ' : ''
    kb.text(`${mark}${model.label}`, `model:${provider}:${model.id}`)
    if (i % 2 === 1) kb.row()
  })
  if (models.length % 2 === 1) kb.row()
  kb.text(t.menu.back, 'nav:main')
  return kb
}

export function settingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(t.settings.persona, 'nav:personas')
    .text(t.settings.creativity, 'nav:creativity')
    .row()
    .text(t.settings.voice, 'nav:voices')
    .text(t.settings.tone, 'nav:tones')
    .row()
    .text(t.settings.language, 'noop')
    .text(t.settings.reset, 'settings:reset')
    .row()
    .text(t.menu.back, 'nav:main')
}

export function personasKeyboard(current: string): InlineKeyboard {
  const kb = new InlineKeyboard()
  t.personas.forEach((p, i) => {
    const mark = p.id === current ? '✅ ' : ''
    kb.text(`${mark}${p.label}`, `persona:${p.id}`)
    if (i % 2 === 1) kb.row()
  })
  if (t.personas.length % 2 === 1) kb.row()
  kb.text(t.menu.back, 'nav:settings')
  return kb
}

export function creativityKeyboard(current: number): InlineKeyboard {
  const levels = [
    { v: 0.2, label: '🧊 دقیق' },
    { v: 0.5, label: '⚖️ متعادل' },
    { v: 0.7, label: '🌟 معمول' },
    { v: 1.0, label: '🔥 خلاق' },
    { v: 1.3, label: '🚀 بسیار خلاق' },
  ]
  const kb = new InlineKeyboard()
  levels.forEach((l, i) => {
    const mark = Math.abs(current - l.v) < 0.05 ? '✅ ' : ''
    kb.text(`${mark}${l.label}`, `temp:${l.v}`)
    if (i % 2 === 1) kb.row()
  })
  kb.row().text(t.menu.back, 'nav:settings')
  return kb
}

export function backKeyboard(target = 'nav:main'): InlineKeyboard {
  return new InlineKeyboard().text(t.menu.back, target)
}

/** کیبورد انتخاب صوت — ۲ تا در هر ردیف */
/** مرحلهٔ اول: انتخاب جنسیت صدا */
export function voiceGenderKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('👩 زنانه (۸)', 'nav:voices_f')
    .text('👨 مردانه (۸)', 'nav:voices_m')
    .row()
    .text(t.menu.back, 'nav:settings')
}

/** فهرست صداهای یک جنسیت */
export function voicesKeyboard(current: string, gender?: 'f' | 'm'): InlineKeyboard {
  const kb = new InlineKeyboard()
  const list = gender ? voicesByGender(gender) : TTS_VOICES
  const title = gender ? (gender === 'f' ? '👩 صداهای زنانه' : '👨 صداهای مردانه') : '🎙️ انتخاب صوت'
  list.forEach((v, i) => {
    const mark = v.name === current ? '✅ ' : ''
    kb.text(`${mark}${v.label}`, `ttsvoice:${v.name}`)
    if (i % 2 === 1) kb.row()
  })
  if (list.length % 2 === 1) kb.row()
  kb.text('↩️ تغییر جنسیت', 'nav:voices')
  kb.text(t.menu.back, 'nav:settings')
  return kb
}

/** عنوان فهرست صداها بر اساس جنسیت */
export function voicesTitle(gender?: 'f' | 'm'): string {
  if (gender === 'f') return '👩 **صداهای زنانه**'
  if (gender === 'm') return '👨 **صداهای مردانه**'
  return t.settings.voiceTitle
}

/** کیبورد انتخاب لحن */
export function tonesKeyboard(current: string): InlineKeyboard {
  const kb = new InlineKeyboard()
  TTS_STYLES.forEach((s, i) => {
    const mark = s.id === current ? '✅ ' : ''
    kb.text(`${mark}${s.label}`, `ttstone:${s.id}`)
    if (i % 2 === 1) kb.row()
  })
  if (TTS_STYLES.length % 2 === 1) kb.row()
  kb.text(t.menu.back, 'nav:settings')
  return kb
}

/** دکمهٔ «بخوان» زیر پاسخ‌های ربات */
export function speakKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('🔊 بخوان', 'tts:last')
}

export function closeKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text(t.menu.close, 'nav:close')
}

export { modelLabel }
