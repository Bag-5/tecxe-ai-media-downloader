/**
 * OpenRouter client.
 *
 * gpt-oss-120b is primary; gpt-oss-20b is the automatic fallback. 20b is
 * sufficient for mechanical tasks (filename/metadata normalisation) where 120b
 * would only cost more, so callers pick the tier via the `tier` argument.
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

export const MODELS = {
  strong: process.env.AI_PRIMARY_MODEL || 'openai/gpt-oss-120b',
  light: process.env.AI_FALLBACK_MODEL || 'openai/gpt-oss-20b',
} as const

export type Tier = keyof typeof MODELS

export class AiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'AiError'
  }
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface CompletionOpts {
  tier?: Tier
  temperature?: number
  maxTokens?: number
  /** When set, the model is constrained to emit this JSON Schema. */
  schema?: Record<string, unknown>
  signal?: AbortSignal
}

interface RawCompletion {
  choices?: Array<{
    message?: { content?: string | null }
    finish_reason?: string
  }>
  error?: { message?: string }
}

/**
 * One completion attempt against a single model.
 * Throws AiError on transport/HTTP failure so the caller can try the fallback.
 */
async function completeOnce(
  model: string,
  messages: AiMessage[],
  opts: CompletionOpts
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new AiError('OPENROUTER_API_KEY is not set in .env.local')
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0.2,
    // gpt-oss emits a `reasoning` field that draws from the same budget as
    // `content`. A small max_tokens is consumed entirely by reasoning and
    // returns an empty completion, so these defaults leave generous headroom.
    max_tokens: opts.maxTokens ?? 4096,
  }

  if (opts.schema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'structured', strict: true, schema: opts.schema },
    }
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'TECXE AI-Media Downloader',
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new AiError(
      `${model} returned ${res.status}: ${text.slice(0, 300)}`,
      res.status
    )
  }

  const json = (await res.json()) as RawCompletion
  if (json.error?.message) {
    throw new AiError(`${model}: ${json.error.message}`, res.status)
  }

  const content = json.choices?.[0]?.message?.content
  if (!content || !content.trim()) {
    // Almost always means reasoning consumed the whole max_tokens budget.
    const reason = json.choices?.[0]?.finish_reason === 'length'
      ? ' — reasoning exhausted max_tokens, raise the cap'
      : ''
    throw new AiError(`${model} returned an empty completion${reason}`, res.status)
  }
  return content
}

/**
 * Completion with automatic strong→light fallback.
 * Returns { content, model } so callers can record which model actually served.
 */
export async function complete(
  messages: AiMessage[],
  opts: CompletionOpts = {}
): Promise<{ content: string; model: string }> {
  const tier = opts.tier ?? 'strong'
  const order: Tier[] = tier === 'light' ? ['light'] : ['strong', 'light']

  let lastError: AiError | null = null

  for (const t of order) {
    try {
      const content = await completeOnce(MODELS[t], messages, opts)
      return { content, model: MODELS[t] }
    } catch (e) {
      if (e instanceof AiError && e.status && e.status < 500 && e.status !== 429) {
        // A 4xx other than rate-limiting will not improve on retry.
        throw e
      }
      lastError = e instanceof AiError ? e : new AiError(String(e))
      console.error(`[ai] ${MODELS[t]} failed, falling back:`, lastError.message)
    }
  }

  throw lastError ?? new AiError('All models failed')
}

/** Completion constrained to a JSON Schema, parsed and validated by `parse`. */
export async function completeJson<T>(
  messages: AiMessage[],
  schema: Record<string, unknown>,
  parse: (v: unknown) => T | null,
  opts: CompletionOpts = {}
): Promise<{ data: T; model: string }> {
  const { content, model } = await complete(messages, { ...opts, schema })

  let raw: unknown
  try {
    // gpt-oss models may wrap JSON in a fenced block despite the schema.
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(content)
    raw = JSON.parse(fenced ? fenced[1] : content)
  } catch {
    throw new AiError(`${model} returned unparseable JSON`)
  }

  const parsed = parse(raw)
  if (parsed === null) {
    throw new AiError(`${model} returned JSON that failed validation`)
  }
  return { data: parsed, model }
}