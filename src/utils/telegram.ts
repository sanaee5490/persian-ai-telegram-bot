import { bot } from '../bot.js'
import { config } from '../config.js'

/** دانلود فایل از سرور تلگرام و تبدیل به base64 */
export async function downloadAsBase64(
  fileId: string,
): Promise<{ mimeType: string; data: string } | null> {
  try {
    const file = await bot.api.getFile(fileId)
    if (!file.file_path) return null
    const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const ext = file.file_path.split('.').pop()?.toLowerCase() ?? 'bin'
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      ogg: 'audio/ogg',
      oga: 'audio/ogg',
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      wav: 'audio/wav',
    }
    return { mimeType: mimeMap[ext] ?? 'application/octet-stream', data: buf.toString('base64') }
  } catch (err) {
    console.error('دانلود فایل ناموفق:', err instanceof Error ? err.message : err)
    return null
  }
}

/** نشانگر «در حال تایپ» با تمدید خودکار */
export function startTyping(chatId: number): () => void {
  let stopped = false
  const send = () => bot.api.sendChatAction(chatId, 'typing').catch(() => {})
  send()
  const timer = setInterval(send, 4000)
  return () => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
  }
}
