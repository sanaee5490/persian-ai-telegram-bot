/** قرارداد مشترک ارائه‌دهندگان هوش مصنوعی */
export interface AiImage {
  mimeType: string
  /** base64 بدون پیشوند data: */
  data: string
}

export interface AiMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  images?: AiImage[]
  audio?: { mimeType: string; data: string }
}

export interface AiRequest {
  system?: string
  messages: AiMessage[]
  temperature?: number
  maxTokens?: number
}

export interface AiResult {
  text: string
  provider: string
  model: string
}

export interface AiModelInfo {
  id: string
  label: string
  vision?: boolean
  audio?: boolean
}

export interface AiProvider {
  id: 'gemini' | 'openrouter'
  label: string
  models: AiModelInfo[]
  chat(model: string, req: AiRequest): Promise<AiResult>
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'AiError'
  }
}
