type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  context: string
  message: string
  requestId?: string
  userId?: string
  meta?: Record<string, unknown>
  data?: Record<string, unknown>
}

// Ensure sensitive values are never logged
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'secret',
  'jwt',
  'jwt_secret',
  'authorization',
  'cookie',
  'key',
  'api_key',
  'apikey',
  'stripe_secret_key',
  'access_key',
  'secret_key',
])

function sanitize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    return obj.map(sanitize)
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitize(value)
    } else {
      result[key] = value
    }
  }
  return result
}

class ServerLogger {
  private format(level: LogLevel, context: string, message: string, data?: Record<string, unknown>, meta?: Record<string, unknown>): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      requestId: meta?.requestId as string | undefined,
      userId: meta?.userId as string | undefined,
      meta,
      data: data ? (sanitize(data) as Record<string, unknown>) : undefined,
    }
  }

  debug(context: string, message: string, data?: Record<string, unknown>, meta?: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'development') {
      const entry = this.format('debug', context, message, data, meta)
      console.debug(JSON.stringify(entry))
    }
  }

  info(context: string, message: string, data?: Record<string, unknown>, meta?: Record<string, unknown>) {
    const entry = this.format('info', context, message, data, meta)
    console.info(JSON.stringify(entry))
  }

  warn(context: string, message: string, data?: Record<string, unknown>, meta?: Record<string, unknown>) {
    const entry = this.format('warn', context, message, data, meta)
    console.warn(JSON.stringify(entry))
  }

  error(context: string, message: string, error?: unknown, meta?: Record<string, unknown>) {
    const errorDetails = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { raw: error }
    const entry = this.format('error', context, message, errorDetails, meta)
    console.error(JSON.stringify(entry))
  }
}

export const logger = new ServerLogger()
