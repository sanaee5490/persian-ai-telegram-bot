# ============================================
#  Dockerfile — برای Render / Railway / Koyeb / Northflank / Fly.io
#  better-sqlite3 ماژول native است، پس ابزار build لازم است
# ============================================
FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- وابستگی‌ها ----
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --include=dev --no-audit --no-fund

# ---- بیلد ----
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- اجرا ----
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
# پوشهٔ دیتابیس (روی Render با Disk به /data mount می‌شود)
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
# health check داخلی
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
