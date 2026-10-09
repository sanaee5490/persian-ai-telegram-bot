import { config } from '../config.js'
import { allModels, getProviders, resolveDefaultModel } from '../ai/index.js'
import { statsStore, settingStore } from '../db/database.js'
import { rateLimitStatus } from '../middleware/rateLimit.js'
import { escapeHtml, formatDate, onOff, toPersianDigits } from '../utils/text.js'
import { configIssues } from '../config.js'

const CSS = `
:root{--bg:#0b1020;--card:#141a2e;--card2:#1b2340;--line:#26304f;--txt:#e8ecf8;--muted:#93a0c0;
--acc:#5b8cff;--acc2:#8b5cf6;--ok:#22c55e;--warn:#f59e0b;--err:#ef4444}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;background:
radial-gradient(1200px 600px at 80% -10%,#1e2a55 0%,transparent 60%),
radial-gradient(900px 500px at -10% 110%,#2a1e55 0%,transparent 60%),var(--bg);
color:var(--txt);min-height:100vh;padding:28px 18px 60px;direction:rtl}
.wrap{max-width:1080px;margin:0 auto}
header{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:22px}
.logo{width:54px;height:54px;border-radius:16px;background:linear-gradient(135deg,var(--acc),var(--acc2));
display:grid;place-items:center;font-size:26px;box-shadow:0 8px 30px rgba(91,140,255,.35)}
h1{font-size:22px;font-weight:700}
.sub{color:var(--muted);font-size:13px;margin-top:2px}
.badge{margin-inline-start:auto;padding:7px 14px;border-radius:999px;font-size:12px;font-weight:600;
border:1px solid var(--line);background:var(--card)}
.badge.live{color:var(--ok);border-color:rgba(34,197,94,.4);background:rgba(34,197,94,.1)}
.badge.demo{color:var(--warn);border-color:rgba(245,158,11,.4);background:rgba(245,158,11,.1)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-bottom:22px}
.card{background:linear-gradient(180deg,var(--card),var(--card2));border:1px solid var(--line);
border-radius:18px;padding:18px;position:relative;overflow:hidden}
.card::after{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.05),transparent 40%);pointer-events:none}
.k{color:var(--muted);font-size:12.5px;margin-bottom:8px}
.v{font-size:26px;font-weight:800;letter-spacing:.5px}
.i{font-size:20px;margin-bottom:8px}
.panel{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px;margin-bottom:18px}
.panel h2{font-size:15px;margin-bottom:14px;display:flex;align-items:center;gap:8px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th,td{text-align:right;padding:10px 8px;border-bottom:1px solid var(--line)}
th{color:var(--muted);font-weight:600;font-size:12px}
tr:last-child td{border-bottom:none}
.pill{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11.5px;font-weight:600}
.pill.ok{background:rgba(34,197,94,.15);color:var(--ok)}
.pill.warn{background:rgba(245,158,11,.15);color:var(--warn)}
.pill.err{background:rgba(239,68,68,.15);color:var(--err)}
.pill.mute{background:rgba(147,160,192,.15);color:var(--muted)}
ul.issues{list-style:none;display:flex;flex-direction:column;gap:10px}
ul.issues li{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.7;
background:var(--card2);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
code{background:#0d1224;border:1px solid var(--line);border-radius:6px;padding:2px 6px;font-size:12px;
font-family:ui-monospace,SFMono-Regular,Menlo,monospace;direction:ltr;display:inline-block}
.steps{counter-reset:s;display:flex;flex-direction:column;gap:12px}
.steps li{counter-increment:s;list-style:none;display:flex;gap:12px;font-size:13.5px;line-height:1.8}
.steps li::before{content:counter(s);min-width:26px;height:26px;border-radius:8px;
background:linear-gradient(135deg,var(--acc),var(--acc2));display:grid;place-items:center;
font-size:12px;font-weight:700;color:#fff}
footer{color:var(--muted);font-size:12px;text-align:center;margin-top:30px}
a{color:var(--acc);text-decoration:none}
@media(max-width:560px){.v{font-size:22px}}
`

function shell(title: string, body: string): string {
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>${CSS}</style></head><body><div class="wrap">${body}</div></body></html>`
}

function badge(): string {
  if (config.demoMode) return '<span class="badge demo">⏸ حالت آماده‌سازی — توکن وارد نشده</span>'
  return '<span class="badge live">● ربات آنلاین</span>'
}

function issuePill(level: 'error' | 'warn'): string {
  return level === 'error' ? '<span class="pill err">خطا</span>' : '<span class="pill warn">هشدار</span>'
}

function setupSteps(): string {
  return `
<ol class="steps">
  <li>در تلگرام به <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> پیام دهید و
      <code>/newbot</code> را بزنید. نام و یوزرنیم ربات را انتخاب کنید. توکن دریافتی را کپی کنید.</li>
  <li>از <a href="https://t.me/userinfobot" target="_blank" rel="noopener">@userinfobot</a> آی‌دی عددی خودتان را بگیرید.</li>
  <li>برای کلید رایگان هوش مصنوعی به
      <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> بروید و
      <code>Create API key</code> را بزنید. (کلید OpenRouter هم در
      <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a> قابل گرفتن است.)</li>
  <li>فایل <code>.env</code> را در ریشهٔ پروژه بسازید (از <code>.env.example</code> کپی کنید) و مقادیر را پر کنید:
      <code>BOT_TOKEN</code>، <code>GEMINI_API_KEY</code>، <code>ADMIN_IDS</code>.</li>
  <li>ربات را دوباره اجرا کنید: <code>npm run dev</code> — همین الان باید آنلاین شود! 🎉</li>
</ol>`
}

export function renderDashboard(): string {
  const totals = statsStore.totals()
  const providers = getProviders()
  const issues = configIssues()
  const rl = rateLimitStatus()

  const providerRows = allModels()
    .map(({ provider, model }) => {
      const p = providers.find((x) => x.id === provider)
      const caps = [model.vision ? '🖼 تصویر' : '', model.audio ? '🎤 صدا' : ''].filter(Boolean).join(' · ')
      return `<tr><td><b>${escapeHtml(model.label)}</b></td><td><code>${escapeHtml(model.id)}</code></td>
<td>${escapeHtml(p?.label ?? provider)}</td><td>${caps || '<span class="pill mute">متن</span>'}</td>
<td>${model.id === resolveDefaultModel() ? '<span class="pill ok">پیش‌فرض</span>' : '<span class="pill mute">—</span>'}</td></tr>`
    })
    .join('')

  const userRows = statsStore
    .allUsers()
    .slice(0, 10)
    .map(
      (u) => `<tr><td>${escapeHtml(u.first_name || u.username || '—')}</td>
<td><code>${u.telegram_id}</code></td>
<td>${toPersianDigits(u.msg_count)}</td>
<td>${toPersianDigits(u.image_count)}</td>
<td>${toPersianDigits(u.voice_count)}</td>
<td>${u.is_banned ? '<span class="pill err">محروم</span>' : u.is_admin ? '<span class="pill ok">ادمین</span>' : '<span class="pill ok">فعال</span>'}</td>
<td>${escapeHtml(formatDate(u.last_seen))}</td></tr>`,
    )
    .join('')

  const body = `
<header>
  <div class="logo">🤖</div>
  <div><h1>دستیار هوش مصنوعی تلگرام</h1>
  <div class="sub">Node.js · grammY · Gemini &amp; OpenRouter — کاملاً رایگان</div></div>
  ${badge()}
</header>

<div class="grid">
  <div class="card"><div class="i">👥</div><div class="k">کاربران</div><div class="v">${toPersianDigits(statsStore.totalUsers())}</div></div>
  <div class="card"><div class="i">💬</div><div class="k">پیام‌های پردازش‌شده</div><div class="v">${toPersianDigits(totals.msg)}</div></div>
  <div class="card"><div class="i">🖼</div><div class="k">تصاویر تحلیل‌شده</div><div class="v">${toPersianDigits(totals.image)}</div></div>
  <div class="card"><div class="i">🎤</div><div class="k">پیام‌های صوتی</div><div class="v">${toPersianDigits(totals.voice)}</div></div>
  <div class="card"><div class="i">🔍</div><div class="k">جستجوهای وب</div><div class="v">${toPersianDigits(totals.search)}</div></div>
  <div class="card"><div class="i">🟢</div><div class="k">فعالان امروز</div><div class="v">${toPersianDigits(statsStore.activeToday())}</div></div>
</div>

<div class="panel">
  <h2>🧩 وضعیت سرویس‌ها</h2>
  <table>
    <tr><th>سرویس</th><th>وضعیت</th><th>جزئیات</th></tr>
    <tr><td>ربات تلگرام</td><td>${config.demoMode ? '<span class="pill warn">غیرفعال</span>' : '<span class="pill ok">آنلاین</span>'}</td>
        <td>${config.demoMode ? 'توکن وارد نشده' : 'Long polling فعال'}</td></tr>
    <tr><td>Google Gemini</td><td>${config.geminiApiKey ? '<span class="pill ok">متصل</span>' : '<span class="pill err">قطع</span>'}</td>
        <td>${config.geminiApiKey ? `${toPersianDigits(providers.find((p) => p.id === 'gemini')?.models.length ?? 0)} مدل در دسترس` : 'کلید API لازم است'}</td></tr>
    <tr><td>OpenRouter</td><td>${config.openRouterApiKey ? '<span class="pill ok">متصل</span>' : '<span class="pill warn">قطع</span>'}</td>
        <td>${config.openRouterApiKey ? `${toPersianDigits(providers.find((p) => p.id === 'openrouter')?.models.length ?? 0)} مدل رایگان` : 'اختیاری — به‌عنوان جایگزین'}</td></tr>
    <tr><td>دیتابیس SQLite</td><td><span class="pill ok">فعال</span></td><td><code>${escapeHtml(config.dbPath.split('/').slice(-2).join('/'))}</code></td></tr>
    <tr><td>جستجوی وب</td><td>${onOff(config.enableWebSearch) ? '<span class="pill ok">فعال</span>' : '<span class="pill warn">غیرفعال</span>'}</td>
        <td>DuckDuckGo — بدون نیاز به کلید</td></tr>
    <tr><td>محدودیت نرخ</td><td><span class="pill ok">فعال</span></td>
        <td>${toPersianDigits(rl.limit)} پیام در دقیقه · ${toPersianDigits(rl.tracked)} کاربر فعال</td></tr>
    <tr><td>مینی‌اپ تلگرام</td><td>${config.demoMode ? '<span class="pill warn">در انتظار توکن</span>' : '<span class="pill ok">آماده</span>'}</td>
        <td><a href="/miniapp" target="_blank">مشاهدهٔ مینی‌اپ</a></td></tr>
  </table>
</div>

${
  issues.length
    ? `<div class="panel"><h2>⚠️ موارد نیازمند توجه</h2><ul class="issues">${issues
        .map((i) => `<li>${issuePill(i.level)}<span>${escapeHtml(i.message)}</span></li>`)
        .join('')}</ul></div>`
    : '<div class="panel"><h2>✅ همه چیز آماده است</h2><p style="font-size:13.5px;color:var(--muted);line-height:1.8">تنظیمات کامل است و ربات آمادهٔ کار است. از تلگرام به ربات خود پیام دهید!</p></div>'
}

<div class="panel">
  <h2>🤖 مدل‌های هوش مصنوعی در دسترس</h2>
  <table><tr><th>مدل</th><th>شناسه</th><th>ارائه‌دهنده</th><th>قابلیت‌ها</th><th></th></tr>${providerRows}</table>
</div>

<div class="panel">
  <h2>👥 آخرین کاربران</h2>
  ${userRows ? `<table><tr><th>نام</th><th>آیدی</th><th>پیام</th><th>عکس</th><th>صدا</th><th>وضعیت</th><th>آخرین فعالیت</th></tr>${userRows}</table>` : '<p style="color:var(--muted);font-size:13px">هنوز کاربری ثبت نشده است.</p>'}
</div>

<div class="panel">
  <h2>🚀 راهنمای راه‌اندازی</h2>
  ${setupSteps()}
</div>

<footer>ساخته‌شده با ❤️ — Node.js + grammY · بدون هیچ سرور پولی</footer>
`

  return shell('داشبورد بات هوش مصنوعی', body)
}
