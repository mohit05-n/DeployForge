import { getSession, SESSION_COOKIE_NAME } from '@/lib/server/auth'
import { successResponse } from '@/lib/server/response'
import { logAuditEvent } from '@/lib/server/audit'

export async function POST(req: Request) {
  const sessionUser = await getSession(req)

  if (sessionUser) {
    await logAuditEvent({
      userId: sessionUser.id,
      action: 'USER_LOGOUT',
      resourceType: 'user',
      resourceId: sessionUser.id,
      req,
    })
  }

  const res = successResponse({ message: 'Signed out successfully' }, 200)

  // Clear HTTP-only session cookie
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  })

  return res
}
