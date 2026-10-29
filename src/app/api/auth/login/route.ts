import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import {
  verifyPassword,
  createSessionToken,
  getSessionCookieOptions,
} from '@/lib/server/auth'
import { successResponse, errorResponse } from '@/lib/server/response'
import { checkRateLimit, getClientIp } from '@/lib/server/rate-limiter'
import { logAuditEvent } from '@/lib/server/audit'
import { logger } from '@/lib/server/logger'

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rateLimit = checkRateLimit(`login:${ip}`, 15, 60000)
  if (!rateLimit.success) {
    return errorResponse('Too many login attempts. Please wait 60 seconds.', 429, 'RATE_LIMITED', undefined, rateLimit)
  }

  try {
    const body = await req.json()
    const parsed = LoginSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse('Invalid email or password format.', 400, 'VALIDATION_ERROR', parsed.error.format(), rateLimit)
    }

    const { email, password } = parsed.data
    const normalizedEmail = email.toLowerCase().trim()

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (!user) {
      logger.warn('Auth', `Login failed: user not found (${normalizedEmail})`)
      return errorResponse('Invalid email or password.', 401, 'INVALID_CREDENTIALS', undefined, rateLimit)
    }

    const isMatch = await verifyPassword(password, user.passwordHash)
    if (!isMatch) {
      logger.warn('Auth', `Login failed: invalid password for ${normalizedEmail}`)
      return errorResponse('Invalid email or password.', 401, 'INVALID_CREDENTIALS', undefined, rateLimit)
    }

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    }

    const token = createSessionToken(safeUser)
    const cookieOpts = getSessionCookieOptions()

    await logAuditEvent({
      userId: user.id,
      action: 'USER_LOGIN',
      resourceType: 'user',
      resourceId: user.id,
      details: { email: user.email },
      req,
    })

    logger.info('Auth', `User logged in: ${user.email}`, { userId: user.id })

    const res = successResponse(
      { user: safeUser, token },
      200,
      'Login successful',
      undefined,
      rateLimit
    )

    res.cookies.set(cookieOpts.name, token, cookieOpts)
    return res
  } catch (err) {
    logger.error('Auth', 'Login exception', err)
    return errorResponse('An error occurred during authentication.', 500, 'INTERNAL_ERROR', undefined, rateLimit)
  }
}
