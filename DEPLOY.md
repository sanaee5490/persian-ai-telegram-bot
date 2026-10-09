# 🚀 راهنمای دیپلوی دائمی (رایگان)

این ربات را طوری نوشتم که روی هر پلتفرمی اجرا شود. فقط **۳ متغیر محیطی** لازم دارد:

| متغیر | مقدار | از کجا |
|---|---|---|
| `BOT_TOKEN` | `YOUR-BOT-TOKEN` | [@BotFather](https://t.me/BotFather) |
| `GEMINI_API_KEY` | `AQ.Ab8RN6...` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `ADMIN_IDS` | `<آیدی-عددی-شما>` | [@userinfobot](https://t.me/userinfobot) |

بقیهٔ متغیرها پیش‌فرض مناسب دارند.

---

## 📊 کدام پلتفرم؟ (مقایسهٔ ۲۰۲۶)

| پلتفرم | کارت اعتباری | می‌خوابد؟ | دائمی؟ | سختی |
|---|---|---|---|---|
| **Zeabur** | ❌ نه | ❌ نه | اعتبار $۵/ماه | ⭐ ساده |
| **Render** | ❌ نه | ✅ بعد ۱۵ دقیقه | با UptimeRobot بیدار می‌ماند | ⭐⭐ متوسط |
| **Railway** | ❌ نه | ❌ نه | اعتبار اولیه تمام‌شدنی | ⭐ ساده |
| **Northflank** | ✅ بله | ❌ نه | ✅ بله، رایگان | ⭐⭐ متوسط |
| **Koyeb** | ✅ بله | ✅ بله | ✅ بله، رایگان | ⭐⭐ متوسط |

### 🏆 توصیهٔ من

**اگه کارت اعتباری نداری → [Zeabar](#گزینهٔ-۱-zeabur--توصیهٔ-اصلی-بدون-کارت-اعتباری)**
اعتبار ماهانهٔ $۵ رایگان می‌دهد. این ربات ماهی حدود ۱ تا ۲ دلار مصرف می‌کند، پس عملاً دائمی و رایگان است.

**اگه اصرار بر $۰ مطلق داری → [Render](#گزینهٔ-۲-render--بدون-کارت-اعتباری-با-uptimerobot) + UptimeRobot**
کاملاً رایگان، فقط باید یه پینگ‌کنندهٔ خارجی بذاری که بیدارش نگه دارد.

---

## گزینهٔ ۱: Zeabar — توصیهٔ اصلی (بدون کارت اعتباری)

### ۱) پروژه رو روی GitHub بذار

```bash
cd telegram-ai-bot
git init
git add .
git commit -m "ربات هوش مصنوعی تلگرام"
```

بعد برو به [github.com/new](https://github.com/new)، یه ریپو خالی بساز و:

```bash
git remote add origin https://github.com/USERNAME/REPO.git
git branch -M main
git push -u origin main
```

### ۲) دیپلوی روی Zeabur

1. برو به [zeabur.com](https://zeabur.com) → **Login with GitHub**
2. **Create Project** → **Deploy New Service** → **GitHub** → ریپوت رو انتخاب کن
3. Zeabur خودکار `Dockerfile` رو تشخیص می‌ده (چون `zeabur.json` گذاشتم)
4. برو تب **Variables** و این‌ها رو اضافه کن:

```
BOT_TOKEN=<توکن-ربات-از-BotFather>
GEMINI_API_KEY=<کلید-Gemini-از-AI-Studio>
ADMIN_IDS=<آیدی-عددی-شما>
NODE_ENV=production
```

5. **Redeploy** بزن
6. Zeabur یه دامنه می‌ده (مثل `xxx.zeabur.app`) — اون رو تو `PUBLIC_URL` بذار

### ۳) بیدار نگه داشتن (مهم!)

Zeabur وقتی ترافیک HTTP نداره سرویس رو idle می‌کنه. برای بیدار موندن:

1. برو به [uptimerobot.com](https://uptimerobot.com) → ثبت‌نام رایگان
2. **Add New Monitor**:
   - Monitor Type: `HTTP(s)`
   - URL: `https://your-app.zeabur.app/health`
   - Monitoring Interval: `5 minutes`
3. Save — از این به بعد هر ۵ دقیقه پینگ می‌خوره و ربات بیدار می‌مونه ✅

---

## گزینهٔ ۲: Render — بدون کارت اعتباری + UptimeRobot

### ۱) روی GitHub بذار (مثل بالا)

### ۲) دیپلوی با Blueprint

1. برو به [dashboard.render.com](https://dashboard.render.com)
2. **New +** → **Blueprint**
3. ریپوی GitHub رو وصل کن
4. Render فایل `render.yaml` رو می‌خونه و همه‌چی رو خودکار تنظیم می‌کند
5. فقط سه متغیر رمز رو پر کن (Render ازت می‌پرسه):

```
BOT_TOKEN        → YOUR-BOT-TOKEN
GEMINI_API_KEY   → AQ.Ab8RN6...
ADMIN_IDS        → <آیدی-عددی-شما>
PUBLIC_URL       → https://your-app.onrender.com
```

6. **Apply** بزن — تمام!

### ۳) حتماً UptimeRobot بذار

Render بعد از **۱۵ دقیقه** بی‌ترافیکی می‌خوابد. بدون پینگ، ربات پیام‌ها رو از دست می‌ده.

- [uptimerobot.com](https://uptimerobot.com) → Monitor جدید → `HTTP(s)`
- URL: `https://your-app.onrender.com/health`
- Interval: `5 minutes`

> ⚠️ **دیتابیس**: Render رایگان دیسک دائمی نداره. با هر دیپلوی، `bot.db` ری‌ست می‌شه (کاربرها و آمار پاک می‌شه). برای یه ربات شخصی/problem نیست؛ اگه مهمه، از PostgreSQL استفاده کن.

---

## گزینهٔ ۳: Railway

```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

بعد تو پنل Railway متغیرها رو设置 کن. فایل `railway.json` از قبل آماده است.

---

## گزینهٔ ۴: Northflank / Koyeb (هیچ‌وقت نمی‌خوابند)

هر دو `Dockerfile` رو می‌خوان:

1. پروژه رو روی GitHub بذار
2. پنل → **Create Service** → **Deploy from GitHub** (یا Docker image)
3. Port: `3000`
4. متغیرهای محیطی رو وارد کن
5. Health check path: `/health`

Northflank کاملاً رایگان و همیشه بیداره، ولی کارت اعتباری برای تأیید هویت می‌خواد (شارژ نمی‌شه).

---

## ✅ چک‌لیست بعد از دیپلوی

بعد از deploy، این‌ها رو چک کن:

```bash
# ۱) سلامت سرویس
curl https://your-app.zeabur.app/health
# باید بده: {"status":"ok","demoMode":false,...}

# ۲) آمار
curl https://your-app.zeabur.app/api/stats
```

بعد تو تلگرام:
- [ ] `/start` → منوی اصلی میاد
- [ ] یه پیام بفرست → جواب می‌ده
- [ ] یه عکس بفرست → تحلیل می‌شه
- [ ] `/search قیمت طلا` → نتیجه می‌ده

---

## 🔒 نکات امنیتی مهم

1. **توکن فعلی لو رفته** — چون تو چت فرستاده شده. بعد از دیپلوی، از [@BotFather](https://t.me/BotFather) دستور `/revoke` بزن، توکن جدید بگیر و تو متغیرهای محیطی پلتفرم آپدیت کن.

2. **`.env` رو هیچ‌وقت push نکن** — من تو `.gitignore` گذاشتم، ولی مطمئن شو.

3. **متغیرهای محیطی فقط تو پنل پلتفرم** وارد بشن، نه تو کد.

---

## 🐛 عیب‌یابی دیپلوی

| علامت | علت | راه‌حل |
|---|---|---|
| `Bot not initialized` | `BOT_TOKEN` خالیه | متغیر رو چک کن |
| لاگ: `هیچ ارائه‌دهندهٔ هوش مصنوعی` | `GEMINI_API_KEY` خالیه | کلید رو وارد کن |
| سرویس sleep می‌شه | پینگ‌کننده نداری | UptimeRobot بذار |
| `EADDRINUSE` | پورت اشغاله | `PORT` رو تغییر بده (پلتفرم‌ها خودش می‌ذارن) |
| `SQLITE_CANTOPEN` | پوشهٔ دیتابیس نیست | `DB_PATH=/data/bot.db` بذار |
| پاسخ‌ها قطع می‌شه | سهمیهٔ رایگان Gemini تموم شده | یه مدل دیگه انتخاب کن یا OpenRouter اضافه کن |

---

## 📱 فعال‌سازی مینی‌اپ بعد از دیپلوی

چون دیپلوی HTTPS داره، مینی‌اپ هم کار می‌کنه:

1. `PUBLIC_URL` رو به آدرس واقعی سرویس تنظیم کن
2. به [@BotFather](https://t.me/BotFather) برو → `/mybots` → ربات → `Bot Settings` → `Menu Button`
3. آدرس `https://your-app.zeabur.app/miniapp` رو وارد کن

تمام! 🎉
