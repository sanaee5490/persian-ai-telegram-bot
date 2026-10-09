import { config } from '../config.js'
import { AiError } from './types.js'

/**
 * تبدیل متن به گفتار (TTS) با Gemini
 * کاملاً رایگان — ازهمین کلید Gemini استفاده می‌کند
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta'
export const TTS_MODEL = 'gemini-3.8-flash-tts'

/**
 * سقف رایگان هر مدل TTS فقط ۱۰ درخواست در روز است.
 * پس سه مدل پشت‌سرهم امتحان می‌شوند تا سقف روزانه ۳۰ درخواست شود.
 */
export const TTS_FALLBACK_MODELS = [
  'gemini-3.8-flash-tts',
  'gemini-3.8-flash-lite-tts',
  'gemini-3.1-flash-tts-preview',
]

export interface TtsVoice {
  name: string
  label: string
  desc: string
}

/** ۱۲ صوت متمایز — همه فارسی صحبت می‌کنند */
export const TTS_VOICES: TtsVoice[] = [
  { name: 'Kore', label: '🎙️ کور', desc: 'محکم و رسمی' },
  { name: 'Puck', label: '⚡ پاک', desc: 'شاد و پرانرژی' },
  { name: 'Charon', label: '📚 کارون', desc: 'آموزنده و دقیق' },
  { name: 'Fenrir', label: '🔥 فنریر', desc: 'هیجانی و پرشور' },
  { name: 'Aoede', label: '🌿 آئوده', desc: 'سبک و دلنشین' },
  { name: 'Leda', label: '🌸 لدا', desc: 'جوانانه و شیرین' },
  { name: 'Zephyr', label: '💨 زفیر', desc: 'روشن و روشن‌گو' },
  { name: 'Orus', label: '🏛️ اوروس', desc: 'استوار و بااعتماد' },
  { name: 'Callirrhoe', label: '🫖 کالیروئه', desc: 'آرام و راحت' },
  { name: 'Autonoe', label: '☀️ اتونوئه', desc: 'شاداب و سرزنده' },
  { name: 'Despina', label: '🌊 دسپینا', desc: 'نرم و روان' },
  { name: 'Gacrux', label: '🎩 گاکروکس', desc: 'بالغ و آرام' },
]

export const DEFAULT_VOICE = 'Kore'

export interface TtsStyle {
  id: string
  label: string
  prompt: string
}

/** ۶ لحن — با دستور زبان طبیعی به مدل گفته می‌شود */
export const TTS_STYLES: TtsStyle[] = [
  { id: 'normal', label: '😐 عادی', prompt: '' },
  { id: 'cheerful', label: '😄 شاد و پرانرژی', prompt: 'به لحنی شاد، پرانرژی و مهربان بخوان' },
  { id: 'calm', label: '😌 آرام و آرامش‌بخش', prompt: 'به لحنی آرام، آهسته و آرامش‌بخش بخوان' },
  { id: 'formal', label: '🎩 رسمی و جدی', prompt: 'به لحنی رسمی، جدی و رسما بخوان' },
  { id: 'excited', label: '🤩 هیجانی', prompt: 'به لحنی هیجانی، مشتاق و با انرژی بالا بخوان' },
  { id: 'friendly', label: '🤝 دوستانه و صمیمی', prompt: 'به لحنی دوستانه، صمیمی و گرم بخوان' },
]

export const DEFAULT_STYLE = 'normal'

export function voiceByName(name: string): TtsVoice | undefined {
  return TTS_VOICES.find((v) => v.name === name)
}

export function styleById(id: string): TtsStyle | undefined {
  return TTS_STYLES.find((s) => s.id === id)
}

export function voiceLabel(name: string): string {
  return voiceByName(name)?.label ?? name
}

export function styleLabel(id: string): string {
  return styleById(id)?.label ?? id
}

/**
 * PCM خام (audio/l16) را به WAV تبدیل می‌کند تا همه‌جا قابل پخش باشد.
 * بدون نیاز به ffmpeg — هدر ۴۴ بایتی را خودمان می‌نویسیم.
 */
function wrapPcmInWav(pcm: Buffer, sampleRate = 24000, channels = 1, bits = 16): Buffer<ArrayBuffer> {
  const byteRate = (sampleRate * channels * bits) / 8
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(channels, 22)
  h.writeUInt32LE(sampleRate, 24)
  h.writeUInt32LE(byteRate, 28)
  h.writeUInt16LE((channels * bits) / 8, 32)
  h.writeUInt16LE(bits, 34)
  h.write('data', 36)
  h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

/** یک درخواست TTS به یک مدل مشخص */
async function callTts(
  model: string,
  prompt: string,
  voice: string,
): Promise<{ data: Buffer; mimeType: string }> {
  const res = await fetch(`${BASE}/models/${model}:generateContent?key=${config.geminiApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new AiError(`TTS ${res.status}: ${detail.slice(0, 200)}`, 'gemini', res.status)
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[]
  }

  const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData
  if (!inline) throw new AiError('مدل صدا تولید نکرد.', 'gemini')

  let buf = Buffer.from(inline.data, 'base64')
  const mime = inline.mimeType || 'audio/wav'

  // اگر PCM خام بود، هدر WAV می‌سازیم
  if (/l16|raw|pcm/i.test(mime)) {
    const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000)
    const ch = Number(/channels=(\d+)/.exec(mime)?.[1] ?? 1)
    buf = wrapPcmInWav(buf, rate, ch, 16)
    return { data: buf, mimeType: 'audio/wav' }
  }

  return { data: buf, mimeType: mime }
}

/** متن را به گفتار تبدیل می‌کند و بافر WAV برمی‌گرداند */
export async function synthesize(
  text: string,
  voice: string = DEFAULT_VOICE,
  styleId: string = DEFAULT_STYLE,
): Promise<{ data: Buffer; mimeType: string }> {
  if (!config.geminiApiKey) {
    throw new AiError('کلید Gemini برای تبدیل متن به صدا لازم است.', 'gemini')
  }

  const clean = text.trim().slice(0, 1200)
  if (!clean) throw new AiError('متنی برای خواندن وجود ندارد.', 'tts')

  const style = styleById(styleId)
  const prompt = style?.prompt ? `${style.prompt}: ${clean}` : clean

  let lastErr: unknown
  for (const model of TTS_FALLBACK_MODELS) {
    try {
      return await callTts(model, prompt, voice)
    } catch (err) {
      lastErr = err
      const status = (err as AiError).status
      // فقط وقتی به مدل بعدی می‌رویم که سقف امروز پر شده باشد
      if (status !== 429 && status !== 503) throw err
      console.warn(`TTS: ${model} پاسخ نداد (${status}) — مدل بعدی امتحان می‌شود`)
    }
  }
  throw lastErr instanceof AiError ? lastErr : new AiError(String(lastErr), 'gemini')
}
