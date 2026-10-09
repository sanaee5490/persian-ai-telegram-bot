import crypto from 'node:crypto'

export interface InitDataUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
  photo_url?: string
}

export interface ValidatedInitData {
  user: InitDataUser
  authDate: number
  queryId?: string
}

/**
 * اعتبارسنجی رسمی داده‌های Telegram WebApp (HMAC-SHA256)
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 24 * 60 * 60,
): { ok: true; data: ValidatedInitData } | { ok: false; reason: string } {
  if (!botToken) return { ok: false, reason: 'توکن ربات تنظیم نشده است.' }

  let params: URLSearchParams
  try {
    params = new URLSearchParams(initData)
  } catch {
    return { ok: false, reason: 'داده نامعتبر است.' }
  }

  const hash = params.get('hash')
  if (!hash) return { ok: false, reason: 'hash موجود نیست.' }

  const pairs: string[] = []
  for (const [k, v] of params.entries()) {
    if (k === 'hash') continue
    pairs.push(`${k}=${v}`)
  }
  pairs.sort()
  const checkString = pairs.join('\n')

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  const computed = crypto.createHmac('sha256', secret).update(checkString).digest('hex')

  const a = Buffer.from(computed, 'hex')
  const b = Buffer.from(hash, 'hex')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'امضای داده معتبر نیست.' }
  }

  const authDate = Number(params.get('auth_date') ?? '0')
  if (!authDate) return { ok: false, reason: 'auth_date موجود نیست.' }
  const age = Math.floor(Date.now() / 1000) - authDate
  if (age > maxAgeSeconds) return { ok: false, reason: 'داده منقضی شده است.' }

  const rawUser = params.get('user')
  if (!rawUser) return { ok: false, reason: 'کاربر مشخص نیست.' }
  let user: InitDataUser
  try {
    user = JSON.parse(rawUser) as InitDataUser
  } catch {
    return { ok: false, reason: 'اطلاعات کاربر نامعتبر است.' }
  }
  if (!user?.id) return { ok: false, reason: 'آیدی کاربر نامعتبر است.' }

  return { ok: true, data: { user, authDate, queryId: params.get('query_id') ?? undefined } }
}
