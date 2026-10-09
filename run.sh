#!/bin/sh
# ============================================
#  سوپروایزر ربات — خودترمیم‌گر
#
#  ۱) اگر node_modules پاک شد (سندباکس ری‌استارت می‌شود) → خودش نصب می‌کند
#  ۲) اگر dist نبود → خودش بیلد می‌کند
#  ۳) اگر ربات مرد → خودش دوباره اجرا می‌کند
#
#  اجرا:  sh run.sh
# ============================================
cd /home/user/telegram-ai-bot || exit 1
mkdir -p data

echo "[supervisor] شروع در $(date)" >> data/bot.log

while true; do
  # ۱) پکیج‌ها
  if [ ! -d node_modules ] || [ ! -f node_modules/.bin/tsx ]; then
    echo "[supervisor] node_modules یافت نشد — در حال نصب..." >> data/bot.log
    npm install --no-audit --no-fund >> data/bot.log 2>&1
  fi

  # ۲) بیلد پروداکشن (اگر نبود)
  if [ ! -d dist ]; then
    echo "[supervisor] dist یافت نشد — در حال بیلد..." >> data/bot.log
    npm run build >> data/bot.log 2>&1
  fi

  # ۳) قفل کهنه را بردار
  rm -f data/.bot.lock

  # ۴) اجرا
  echo "[supervisor] --- اجرای ربات در $(date) ---" >> data/bot.log
  npm start >> data/bot.log 2>&1
  CODE=$?

  echo "[supervisor] ربات با کد $CODE خارج شد — ری‌استارت در ۳ ثانیه" >> data/bot.log
  sleep 3
done
