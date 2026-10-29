interface RateLimitRecord {
  timestamps: number[]
}

const store = new Map<string, RateLimitRecord>()

// Clean up stale entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, record] of store.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < 60000)
      if (record.timestamps.length === 0) {
        store.delete(key)
      }
    }
  }, 5 * 60 * 1000).unref()
}

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  resetMs: number
}

export function checkRateLimit(
  identifier: string,
  limit: number = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  windowMs: number = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10)
): RateLimitResult {
  const now = Date.now()
  const record = store.get(identifier) ?? { timestamps: [] }

  // Filter out timestamps outside the sliding window
  const validTimestamps = record.timestamps.filter((ts) => now - ts < windowMs)

  if (validTimestamps.length >= limit) {
    const oldest = validTimestamps[0]
    const resetMs = Math.max(0, windowMs - (now - oldest))
    return {
      success: false,
      limit,
      remaining: 0,
      resetMs,
    }
  }

  validTimestamps.push(now)
  store.set(identifier, { timestamps: validTimestamps })

  return {
    success: true,
    limit,
    remaining: limit - validTimestamps.length,
    resetMs: windowMs,
  }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }
  return '127.0.0.1'
}
