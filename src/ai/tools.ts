/**
 * ابزارهای دستیار: انسانی‌سازی، ترجمه، خلاصه‌سازی، خواندن سند
 * همه با همان کلید رایگان Gemini کار می‌کنند
 */

import { chat, resolveDefaultModel } from './index.js'
import type { AiImage } from './types.js'

/** یک درخواست سادهٔ تک‌مرحله‌ای به هوش مصنوعی */
async function ask(system: string, userText: string, temperature = 0.6): Promise<string> {
  const res = await chat(resolveDefaultModel(), {
    system,
    messages: [{ role: 'user', content: userText }],
    temperature,
    maxTokens: 4096,
  })
  return res.text.trim()
}

/**
 * متن تولیدشده با هوش مصنوعی را به فارسی طبیعی و انسانی تبدیل می‌کند
 * تا از تشخیص‌دهنده‌های متن AI عبور کند.
 */
export async function humanize(text: string): Promise<string> {
  return ask(
    [
      'تو یک ویراستار حرفه‌ای فارسی هستی.',
      'متن داده‌شده را بازنویسی کن تا:',
      '۱. کاملاً طبیعی، روان و انسانی به نظر برسد',
      '۲. ساختار جمله‌ها متنوع و نامتقارن باشد (از الگوی تکراری پرهیز شود)',
      '۳. از کلمات کلیشه‌ای و عبارات رباتیک استفاده نشود',
      '۴. معنا و اطلاعات اصلی دقیقاً حفظ شود',
      '۵. لحن گرم و شخصی داشته باشد',
      '',
      'فقط متن بازنویسی‌شده را برگردان. هیچ توضیح، عنوان یا کمکی اضافه نکن.',
    ].join('\n'),
    text,
    0.9,
  )
}

/** ترجمهٔ حرفه‌ای بین فارسی و انگلیسی */
export async function translate(text: string, target: 'fa' | 'en'): Promise<string> {
  const lang = target === 'fa' ? 'فارسی' : 'انگلیسی'
  return ask(
    [
      `تو یک مترجم حرفه‌ای و بومی به ${lang} هستی.`,
      'قواعد:',
      '۱. معنا را دقیق و کامل منتقل کن، نه ترجمهٔ کلمه‌به‌کلمه',
      '۲. لحن و ثبت متن اصلی را حفظ کن',
      '۳. اصطلاحات تخصصی را درست برگردان',
      '۴. نام افراد و مکان‌ها را دست نخورده بگذار',
      '۵. خروجی باید آمادهٔ استفاده باشد، بدون هیچ توضیح اضافه',
      '',
      'فقط ترجمه را برگردان.',
    ].join('\n'),
    text,
    0.3,
  )
}

/** خلاصه‌سازی متن بلند */
export async function summarize(text: string, style: 'short' | 'bullets' | 'detailed' = 'short'): Promise<string> {
  const guide = {
    short: 'خلاصه‌ای در ۲ تا ۴ جملهٔ کوتاه و روان بنویس.',
    bullets: '۵ تا ۸ نکتهٔ کلیدی را با 🔹 در خطوط جداگانه بنویس.',
    detailed: 'خلاصه‌ای کامل و ساختارمند با عنوان‌بندی بنویس.',
  }[style]

  return ask(
    [
      'تو یک دستیار پژوهشگر فارسی‌زبان هستی.',
      'متن داده‌شده را خلاصه کن.',
      guide,
      'قواعد: فقط به زبان فارسی پاسخ بده. اطلاعات کلیدی و عددها را حفظ کن. هیچ مقدمه‌ای ننویس.',
    ].join('\n'),
    text,
    0.4,
  )
}

/**
 * خواندن متن از تصویر (OCR) یا تحلیل سند
 * اگر goal بدهی، خروجی ساختارمند می‌شود (مثلاً تبدیل فاکتور به جدول)
 */
export async function readImage(images: AiImage[], goal: string): Promise<string> {
  const res = await chat(resolveDefaultModel(), {
    system: [
      'تو یک دستیار دقیق فارسی‌زبان هستی که متن و اسناد را از تصویر می‌خوانی.',
      'قواعد:',
      '۱. هر متن موجود در تصویر را دقیق استخراج کن',
      '۲. ساختار جدول‌ها و لیست‌ها را حفظ کن',
      '۳. اعداد و تاریخ‌ها را دقیق بنویس',
      '۴. اگر متن فارسی است فارسی بنویس، اگر انگلیسی است انگلیسی',
      '۵. هیچ توضیح اضافه‌ای نده، فقط خروجی درخواستی',
    ].join('\n'),
    messages: [{ role: 'user', content: goal, images }],
    temperature: 0.2,
    maxTokens: 4096,
  })
  return res.text.trim()
}

/** استخراج متن خام از یک صفحهٔ وب */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** محتوای یک لینک را می‌خواند و خلاصه می‌کند */
export async function summarizeUrl(url: string, style: 'short' | 'bullets' | 'detailed' = 'short'): Promise<{ summary: string; title?: string; words: number }> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; PersianAIBot/1.0)',
      'Accept-Language': 'fa,en;q=0.8',
    },
    signal: AbortSignal.timeout(30_000),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`دریافت صفحه ناموفق بود (HTTP ${res.status})`)

  const html = await res.text()
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const title = titleMatch ? htmlToText(titleMatch[1]!).slice(0, 150) : undefined

  const body = htmlToText(html)
  if (body.length < 40) throw new Error('از این صفحه متن قابل استخراجی پیدا نشد.')

  const clipped = body.slice(0, 12000)
  const summary = await summarize(clipped, style)
  return { summary, title, words: clipped.split(/\s+/).length }
}
