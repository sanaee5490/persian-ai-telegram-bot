/**
 * حافظهٔ بلندمدت کاربر
 * حقایق مهم دربارهٔ کاربر را ذخیره و در زمان مناسب یادآوری می‌کند
 */

import { chat, resolveDefaultModel } from '../ai/index.js'
import { embed, cosineSimilarity, packVector, unpackVector } from '../ai/embeddings.js'
import { db, memoryStore } from '../db/database.js'

/** سقف خاطقات ذخیره‌شده برای هر کاربر */
const MAX_MEMORIES = 60

// کش کوچک برای جلوگیری از درخواست تکراری امبدینگ
const embeddingCache = new Map<string, number[]>()

async function embedCached(text: string): Promise<number[] | undefined> {
  const hit = embeddingCache.get(text)
  if (hit) return hit
  const v = await embed(text)
  if (v) {
    embeddingCache.set(text, v)
    if (embeddingCache.size > 200) embeddingCache.clear()
  }
  return v
}

/**
 * از یک گفتگو، حقایق قابل یادآوری را استخراج و ذخیره می‌کند.
 * مثل: نام، شغل، شهر، سلیقه، هدف
 */
export async function extractMemories(userId: number, userText: string, botReply: string): Promise<string[]> {
  try {
    const res = await chat(resolveDefaultModel(), {
      system: [
        'از گفتگوی زیر، حقایق پایدار و قابل یادآوری دربارهٔ کاربر را استخراج کن.',
        'مثال‌های خوب: نام، شغل، شهر، زبان، سلیقه، هدف، ترجیح، محدودیت.',
        'مثال‌های بد: سوالات یک‌بارمصرف، احوالپرسی، درخواست‌های موقت.',
        '',
        'خروجی: هر حقیقت در یک خط جداگانه، کوتاه و دقیق (حداکثر ۱۵ کلمه).',
        'اگر حقیقت مهمی نبود، دقیقاً بنویس: هیچ',
      ].join('\n'),
      messages: [{ role: 'user', content: `کاربر: ${userText}\nدستیار: ${botReply}` }],
      temperature: 0.2,
      maxTokens: 300,
    })

    const raw = res.text.trim()
    if (!raw || raw === 'هیچ') return []

    const facts = raw
      .split('\n')
      .map((l) => l.replace(/^[-•*\d.)\s]+/, '').trim())
      .filter((l) => l.length > 3 && l.length < 200)
      .slice(0, 3)

    const saved: string[] = []
    for (const fact of facts) {
      if (await isDuplicate(userId, fact)) continue
      const vec = await embedCached(fact)
      memoryStore.add(userId, fact, vec ? packVector(vec) : undefined)
      saved.push(fact)
    }

    // اگر خاطرات زیاد شد، قدیمی‌ترها را حذف کن
    if (memoryStore.count(userId) > MAX_MEMORIES) {
      const stale = memoryStore.all(userId).slice(MAX_MEMORIES)
      const del = db.prepare('DELETE FROM memories WHERE id = ?')
      for (const m of stale) del.run(m.id)
    }

    return saved
  } catch {
    return []
  }
}

/** آیا این حقیقت تقریباً قبلاً ذخیره شده؟ */
async function isDuplicate(userId: number, fact: string): Promise<boolean> {
  const vec = await embedCached(fact)
  if (!vec) return false
  for (const m of memoryStore.all(userId)) {
    const old = m.vector ? unpackVector(m.vector) : undefined
    if (old && cosineSimilarity(vec, old) > 0.92) return true
  }
  return false
}

/** خاطرات مرتبط با متن فعلی را برمی‌گرداند */
export async function recallMemories(userId: number, query: string, limit = 5): Promise<string[]> {
  const all = memoryStore.all(userId)
  if (all.length === 0) return []

  const qv = await embedCached(query)
  if (!qv) return all.slice(0, limit).map((m) => m.content)

  return all
    .map((m) => {
      const v = m.vector ? unpackVector(m.vector) : undefined
      return { content: m.content, score: v ? cosineSimilarity(qv, v) : 0 }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.content)
}

/** حافظه را به شکل متنی برای تزریق به system prompt */
export async function memoryContext(userId: number, query: string): Promise<string> {
  const facts = await recallMemories(userId, query)
  if (facts.length === 0) return ''
  return ['چیزهایی که دربارهٔ این کاربر می‌دانی:', ...facts.map((f) => `• ${f}`)].join('\n')
}
