# 🎯 مراحل دیپلوی رایگان و دائمی روی Render

همه‌چیز آماده است. فقط این ۴ مرحله را انجام بده — حدود **۱۰ دقیقه**.

---

## مرحلهٔ ۱ — کدها را روی GitHub بذار (۳ دقیقه)

ترمینال را در پوشهٔ پروژه باز کن و این‌ها را بزن:

```bash
cd telegram-ai-bot
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git branch -M main
git push -u origin main
```

> `YOUR-USERNAME` و `YOUR-REPO` را با اسم خودت و اسم ریپوی که ساختی عوض کن.
> اول برو به [github.com/new](https://github.com/new)، یه ریپو بساز (Public یا Private فرقی ندارد).

---

## مرحلهٔ ۲ — دیپلوی روی Render (۳ دقیقه)

1. برو به 👉 **https://dashboard.render.com**
2. ثبت‌نام با **GitHub** (کارت اعتباری نمی‌خواهد)
3. دکمهٔ **New +** (بالا راست) → **Blueprint**
4. ریپوی خودت را انتخاب کن → **Connect**
5. Render فایل `render.yaml` را می‌خواند و همه‌چیز را خودکار می‌سازد
6. ازت **۳ متغیر** را می‌پرسد — این‌ها را وارد کن:

| Key | Value |
|---|---|
| `BOT_TOKEN` | `<توکن-ربات-از-BotFather>` |
| `GEMINI_API_KEY` | `<کلید-Gemini-از-AI-Studio>` |
| `ADMIN_IDS` | `<آیدی-عددی-شما>` |

7. دکمهٔ **Apply** را بزن
8. صبر کن تا بیلد تمام شود (حدود ۲-۳ دقیقه) → باید سبز شود ✅

---

## مرحلهٔ ۳ — آدرس سرویس را به ربات بده (۱ دقیقه)

1. تو پنل Render، بالای صفحه آدرس سرویس را کپی کن
   (چیزی شبیه `https://persian-ai-telegram-bot-xxxx.onrender.com`)
2. برو تب **Environment** → متغیر `PUBLIC_URL` را اضافه/ویرایش کن:
   ```
   PUBLIC_URL=https://persian-ai-telegram-bot-xxxx.onrender.com
   ```
3. **Save Changes** → Render خودکار دوباره دیپلوی می‌کند

---

## مرحلهٔ ۴ — UptimeRobot تا ربات نخوابد (۳ دقیقه)

> ⚠️ **مهم‌ترین مرحله!** Render سرویس رایگان را بعد از **۱۵ دقیقه** بی‌ترافیکی می‌خواباند.
> اون موقع ربات پیام‌ها را از دست می‌دهد. با یه پینگ هر ۵ دقیقه، هرگز نمی‌خوابد.

1. برو به 👉 **https://uptimerobot.com** → ثبت‌نام رایگان
2. **+ Add New Monitor**
3. این‌ها را پر کن:

| فیلد | مقدار |
|---|---|
| Monitor Type | `HTTP(s)` |
| Friendly Name | `ربات تلگرام` |
| URL | `https://YOUR-APP.onrender.com/health` |
| Monitoring Interval | `5 minutes` |

4. **Create Monitor** → تمام! 🎉

---

## ✅ تست نهایی

بعد از چند دقیقه، این‌ها را چک کن:

**الف) تو مرورگر:**
```
https://YOUR-APP.onrender.com/health
```
باید ببینی:
```json
{"status":"ok","demoMode":false,...}
```

**ب) تو تلگرام:**
- `/start` → منوی اصلی بیاد
- یه پیام بفرست → جواب بده
- یه عکس بفرست → تحلیل بشه
- `/search قیمت طلا` → نتیجه بده

---

## 🔐 مهم: توکن را عوض کن

توکن ربات تو چت فرستاده شده، یعنی **لو رفته**. بعد از دیپلوی:

1. برو [@BotFather](https://t.me/BotFather)
2. `/mybots` → ربات → **API Token** → **Revoke current token**
3. توکن جدید را کپی کن
4. تو پنل Render → **Environment** → `BOT_TOKEN` را آپدیت کن
5. Save

---

## 🐛 اگه مشکل خوردی

| چی دیدی | یعنی | کار |
|---|---|---|
| Build failed | خطای بیلد | تو Render → **Logs** را ببین |
| `Bot not initialized` | توکن خالی | `BOT_TOKEN` را چک کن |
| `هیچ ارائه‌دهندهٔ هوش مصنوعی` | کلید خالی | `GEMINI_API_KEY` را چک کن |
| ربات نصفه‌کاره | خوابیده | UptimeRobot درست ست نشده |
| آمار صفر شد | دیتابیس ریست | طبیعتست — Render رایگان دیسک دائمی ندارد |
| سهمیهٔ Gemini تموم | ۱۵۰۰ درخواست روزانه | مدل عوض کن یا کلید OpenRouter اضافه کن |

**لاگ زنده:** تو Render → **Logs** — من به ربات لاگ کامل دادم، هر پیام ورودی و زمان پردازشش را می‌بینی.

---

## 📱 مینی‌اپ (اختیاری، بعد از دیپلوی)

چون Render HTTPS می‌دهد، مینی‌اپ هم کار می‌کند:

1. [@BotFather](https://t.me/BotFather) → `/mybots` → ربات
2. **Bot Settings** → **Menu Button** → **Set Menu Button**
3. آدرس: `https://YOUR-APP.onrender.com/miniapp`

تمام! 🚀
