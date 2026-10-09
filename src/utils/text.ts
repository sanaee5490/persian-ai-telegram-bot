/** توابع کمکی متنی */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** تقسیم متن بلند به قطعات قابل ارسال در تلگرام (محدودیت ۴۰۹۶ کاراکتر) */
export function chunkText(text: string, size = 4000): string[] {
  if (text.length <= size) return [text]
  const chunks: string[] = []
  let current = ''
  const lines = text.split('\n')
  for (const line of lines) {
    if ((current + '\n' + line).length > size) {
      if (current) chunks.push(current)
      current = ''
      if (line.length > size) {
        // خط خیلی بلند → به‌زور تقسیم می‌کنیم
        for (let i = 0; i < line.length; i += size) chunks.push(line.slice(i, i + size))
        continue
      }
    }
    current = current ? `${current}\n${line}` : line
  }
  if (current) chunks.push(current)
  return chunks
}

/** ارسال پاسخ بلند به‌صورت چند پیام پشت‌سرهم */
export async function sendLong(
  reply: (text: string) => Promise<unknown>,
  text: string,
  size = 4000,
): Promise<void> {
  const chunks = chunkText(text, size)
  for (const c of chunks) {
    await reply(c).catch(() => {})
    if (chunks.length > 1) await new Promise((r) => setTimeout(r, 300))
  }
}

/** تبدیل ارقام انگلیسی به فارسی */
export function toPersianDigits(input: string | number): string {
  const fa = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
  return String(input).replace(/\d/g, (d) => fa[Number(d)]!)
}

/** فرمت تاریخ شمسی خوانا */
export function formatDate(iso: string): string {
  const d = new Date(iso.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return iso
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Tehran',
    }).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

/** نمایش وضعیت فعال/غیرفعال */
export function onOff(v: boolean): string {
  return v ? '✅' : '❌'
}
