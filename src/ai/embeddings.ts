/**
 * امبدینگ (بردار معنایی) برای حافظهٔ بلندمدت
 * کاملاً رایگان — از همان کلید Gemini استفاده می‌کند
 */

import { config } from '../config.js'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'
export const EMBED_MODEL = 'gemini-embedding-001'
export const EMBED_DIM = 3072

/** متن را به بردار معنایی تبدیل می‌کند */
export async function embed(text: string): Promise<number[] | undefined> {
  if (!config.geminiApiKey) return undefined
  try {
    const res = await fetch(`${BASE}/models/${EMBED_MODEL}:embedContent?key=${config.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        content: { parts: [{ text: text.slice(0, 2000) }] },
      }),
    })
    if (!res.ok) return undefined
    const data = (await res.json()) as { embedding?: { values?: number[] } }
    return data.embedding?.values
  } catch {
    return undefined
  }
}

/** شباهت کسینوسی بین دو بردار (۰ تا ۱) */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i++) {
    const x = a[i]!
    const y = b[i]!
    dot += x * y
    na += x * x
    nb += y * y
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** بردار را برای ذخیره در دیتابیس فشرده می‌کند */
export function packVector(v: number[]): string {
  return v.map((n) => n.toFixed(4)).join(',')
}

/** بردار ذخیره‌شده را بازمی‌کند */
export function unpackVector(s: string): number[] | undefined {
  if (!s) return undefined
  const parts = s.split(',')
  if (parts.length < 8) return undefined
  return parts.map((n) => Number.parseFloat(n))
}
