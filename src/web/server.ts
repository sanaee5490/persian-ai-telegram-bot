import express from 'express'
import type { Server } from 'node:http'
import { config } from '../config.js'
import { statsStore, upsertUser } from '../db/database.js'
import { historyStore, userStore } from '../db/database.js'
import { allModels, resolveDefaultModel } from '../ai/index.js'
import { buildSystemPrompt, effectiveTemperature, userModelInfo } from '../services/assistant.js'
import { t } from '../i18n/fa.js'
import { validateInitData } from './initData.js'
import { renderDashboard } from './dashboard.js'
import { renderMiniApp } from './miniapp.js'

export function createServer(): express.Express {
  const app = express()
  app.use(express.json({ limit: '1mb' }))

  // اعتماد به هاست پیش‌نمایش (بدون بررسی origin)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    next()
  })

  app.get('/', (_req, res) => {
    res.type('html').send(renderDashboard())
  })

  app.get('/miniapp', (_req, res) => {
    res.type('html').send(renderMiniApp())
  })

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      demoMode: config.demoMode,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    })
  })

  app.get('/api/stats', (_req, res) => {
    const totals = statsStore.totals()
    res.json({
      users: statsStore.totalUsers(),
      messages: statsStore.totalMessages(),
      activeToday: statsStore.activeToday(),
      ...totals,
      models: allModels().map((m) => ({ ...m.model, provider: m.provider })),
      defaultModel: resolveDefaultModel(),
    })
  })

  /** گفتگو از طریق مینی‌اپ تلگرام */
  app.post('/api/chat', async (req, res) => {
    const initData = String(req.headers['x-telegram-init-data'] ?? '')
    const { message, history } = req.body as { message?: string; history?: { role: string; content: string }[] }

    const check = validateInitData(initData, config.botToken)
    if (!check.ok) {
      res.status(401).json({ ok: false, error: 'احراز هویت تلگرام ناموفق بود: ' + check.reason })
      return
    }

    const text = (message ?? '').toString().slice(0, 4000).trim()
    if (!text) {
      res.status(400).json({ ok: false, error: 'پیام خالی است.' })
      return
    }

    const user = upsertUser(check.data.user.id, check.data.user.username, check.data.user.first_name)
    if (user.is_banned) {
      res.status(403).json({ ok: false, error: 'شما محروم شده‌اید.' })
      return
    }

    try {
      const { chat } = await import('../ai/index.js')
      const model = userModelInfo(user.telegram_id)
      const messages = [
        ...(Array.isArray(history) ? history.slice(-10) : []).map((h) => ({
          role: (h.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: String(h.content).slice(0, 2000),
        })),
        { role: 'user' as const, content: text },
      ]
      const result = await chat(model.id, {
        system: buildSystemPrompt(user.telegram_id),
        messages,
        temperature: effectiveTemperature(user.telegram_id),
        maxTokens: config.maxTokens,
      })
      historyStore.add(user.telegram_id, 'user', text)
      historyStore.add(user.telegram_id, 'assistant', result.text)
      userStore.inc.msg(user.telegram_id)
      res.json({ ok: true, reply: result.text, model: result.model, persona: user.persona })
    } catch (err) {
      console.error('مینی‌اپ خطا:', err instanceof Error ? err.message : err)
      res.status(500).json({ ok: false, error: 'پاسخ‌دهی ناموفق بود. بعداً تلاش کنید.' })
    }
  })

  app.get('/api/personas', (_req, res) => {
    res.json(t.personas.map((p) => ({ id: p.id, label: p.label })))
  })

  app.use((_req, res) => {
    res.status(404).type('html').send('<div style="font-family:Tahoma;padding:40px;text-align:center">۴۰۴ — پیدا نشد</div>')
  })

  return app
}

export function startServer(): Server {
  const app = createServer()
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`🌐 داشبورد وب: http://localhost:${config.port}`)
    console.log(`📱 مینی‌اپ تلگرام: http://localhost:${config.port}/miniapp`)
  })
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ پورت ${config.port} اشغال است. در .env مقدار PORT را تغییر دهید.`)
    } else {
      console.error('❌ خطای سرور وب:', err.message)
    }
  })
  return server
}
