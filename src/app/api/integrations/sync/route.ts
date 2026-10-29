import { POST as handleSync } from '../route'

export async function POST(req: Request) {
  return handleSync(req)
}
