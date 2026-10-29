import { NextResponse } from 'next/server'
import { RateLimitResult } from './rate-limiter'

export interface ApiSuccessResponse<T> {
  success: true
  data: T
  message?: string
  meta?: Record<string, unknown>
}

export interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export function successResponse<T>(
  data: T,
  status: number = 200,
  message?: string,
  meta?: Record<string, unknown>,
  rateLimit?: RateLimitResult
): NextResponse<ApiSuccessResponse<T>> {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(message ? { message } : {}),
    ...(meta ? { meta } : {}),
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (rateLimit) {
    headers['X-RateLimit-Limit'] = rateLimit.limit.toString()
    headers['X-RateLimit-Remaining'] = rateLimit.remaining.toString()
    headers['X-RateLimit-Reset'] = Math.ceil(rateLimit.resetMs / 1000).toString()
  }

  return NextResponse.json(body, { status, headers })
}

export function errorResponse(
  message: string,
  status: number = 400,
  code: string = 'BAD_REQUEST',
  details?: unknown,
  rateLimit?: RateLimitResult
): NextResponse<ApiErrorResponse> {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (rateLimit) {
    headers['X-RateLimit-Limit'] = rateLimit.limit.toString()
    headers['X-RateLimit-Remaining'] = rateLimit.remaining.toString()
    headers['X-RateLimit-Reset'] = Math.ceil(rateLimit.resetMs / 1000).toString()
  }

  return NextResponse.json(body, { status, headers })
}
