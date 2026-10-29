import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import {
  hashPassword,
  createSessionToken,
  getSessionCookieOptions,
} from '@/lib/server/auth'
import { successResponse, errorResponse } from '@/lib/server/response'
import { checkRateLimit, getClientIp } from '@/lib/server/rate-limiter'
import { logAuditEvent } from '@/lib/server/audit'
import { logger } from '@/lib/server/logger'

const RegisterSchema = z.object({
  email: z.string().email('Invalid email address').max(100),
  name: z.string().min(2, 'Name must be at least 2 characters').max(60),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
})

export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rateLimit = checkRateLimit(`register:${ip}`, 10, 60000)
  if (!rateLimit.success) {
    return errorResponse('Too many registration attempts. Please wait a moment.', 429, 'RATE_LIMITED', undefined, rateLimit)
  }

  try {
    const body = await req.json()
    const parsed = RegisterSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors[0]?.message || 'Invalid input',
        400,
        'VALIDATION_ERROR',
        parsed.error.format(),
        rateLimit
      )
    }

    const { email, name, password } = parsed.data
    const normalizedEmail = email.toLowerCase().trim()

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (existingUser) {
      return errorResponse('An account with this email already exists.', 409, 'EMAIL_EXISTS', undefined, rateLimit)
    }

    const passwordHash = await hashPassword(password)

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name.trim(),
        passwordHash,
        role: 'DEVELOPER',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    })

    const token = createSessionToken(user)
    const cookieOpts = getSessionCookieOptions()

    await logAuditEvent({
      userId: user.id,
      action: 'USER_REGISTER',
      resourceType: 'user',
      resourceId: user.id,
      details: { email: user.email },
      req,
    })

    logger.info('Auth', `User registered successfully: ${user.email}`, { userId: user.id })

    const res = successResponse(
      { user, token },
      201,
      'Registration successful',
      undefined,
      rateLimit
    )

    res.cookies.set(cookieOpts.name, token, cookieOpts)
    return res
  } catch (err) {
    logger.error('Auth', 'Registration error', err)
    return errorResponse('An unexpected error occurred during registration.', 500, 'INTERNAL_ERROR', undefined, rateLimit)
  }
}
