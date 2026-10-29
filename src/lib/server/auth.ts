import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { errorResponse } from './response'
import { logger } from './logger'

const JWT_SECRET = process.env.JWT_SECRET || 'deployforge_fallback_dev_secret_32_characters_minimum!'
export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'deployforge_session'
const SESSION_MAX_AGE_SECONDS = parseInt(process.env.SESSION_MAX_AGE_SECONDS || '604800', 10) // 7 days

export interface SessionUser {
  id: string
  email: string
  name: string
  role: string
}

export interface AuthContext {
  user: SessionUser
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function createSessionToken(user: SessionUser): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    JWT_SECRET,
    {
      expiresIn: SESSION_MAX_AGE_SECONDS,
      issuer: 'deployforge-api',
      audience: 'deployforge-app',
    }
  )
}

export function verifySessionToken(token: string): SessionUser | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: 'deployforge-api',
      audience: 'deployforge-app',
    }) as { sub: string; email: string; name: string; role: string }

    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    }
  } catch (err) {
    logger.debug('Auth', 'Session token verification failed', { error: (err as Error).message })
    return null
  }
}

export async function getSession(req?: Request): Promise<SessionUser | null> {
  let token: string | undefined

  // 1. Check Bearer Authorization header if request is provided
  if (req) {
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim()
    }
  }

  // 2. Check HTTP-only cookie if no Bearer header
  if (!token) {
    try {
      const cookieStore = await cookies()
      token = cookieStore.get(SESSION_COOKIE_NAME)?.value
    } catch (_) {
      // In route handlers or non-Next.js contexts
      if (req) {
        const cookieHeader = req.headers.get('cookie') || ''
        const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`))
        if (match) {
          token = decodeURIComponent(match[1])
        }
      }
    }
  }

  if (!token) {
    return null
  }

  return verifySessionToken(token)
}

export async function requireAuth(req: Request): Promise<{ user: SessionUser } | { response: ReturnType<typeof errorResponse> }> {
  const user = await getSession(req)
  if (!user) {
    return {
      response: errorResponse('Authentication required. Please sign in.', 401, 'UNAUTHORIZED'),
    }
  }

  // Ensure user still exists in database
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true, role: true },
  })

  if (!dbUser) {
    return {
      response: errorResponse('User account not found or deactivated.', 401, 'USER_NOT_FOUND'),
    }
  }

  return { user: dbUser }
}

export function getSessionCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production'
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  }
}
