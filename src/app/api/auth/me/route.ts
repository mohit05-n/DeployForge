import { requireAuth } from '@/lib/server/auth'
import { successResponse } from '@/lib/server/response'

export async function GET(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  return successResponse({
    user: auth.user,
  })
}
