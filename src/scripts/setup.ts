/** اسکریپت کمکی راه‌اندازی اولیه */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const envPath = path.join(root, '.env')
const examplePath = path.join(root, '.env.example')

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, resolve))
}

async function main(): Promise<void> {
  if (fs.existsSync(envPath)) {
    console.log('✅ فایل .env از قبل وجود دارد.')
    return
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  console.log('\n🔧 راه‌اندازی اولیهٔ ربات\n')

  const botToken = await ask(rl, '۱) توکن ربات از @BotFather: ')
  const geminiKey = await ask(rl, '۲) کلید Google AI Studio (خالی = رد شدن): ')
  const orKey = await ask(rl, '۳) کلید OpenRouter (خالی = رد شدن): ')
  const adminIds = await ask(rl, '۴) آی‌دی عددی شما از @userinfobot: ')

  let content = fs.existsSync(examplePath) ? fs.readFileSync(examplePath, 'utf8') : ''
  content = content
    .replace(/^BOT_TOKEN=.*$/m, `BOT_TOKEN=${botToken.trim()}`)
    .replace(/^GEMINI_API_KEY=.*$/m, `GEMINI_API_KEY=${geminiKey.trim()}`)
    .replace(/^OPENROUTER_API_KEY=.*$/m, `OPENROUTER_API_KEY=${orKey.trim()}`)
    .replace(/^ADMIN_IDS=.*$/m, `ADMIN_IDS=${adminIds.trim()}`)

  fs.writeFileSync(envPath, content, 'utf8')
  rl.close()
  console.log('\n✅ فایل .env ساخته شد. حالا دستور npm run dev را بزنید.\n')
}

main().catch(console.error)
