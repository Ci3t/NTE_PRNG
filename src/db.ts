import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type {
  PullInsertPayload,
  PullRow,
  SecondStatsRow,
} from './types.ts'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let client: SupabaseClient | null = null

export function isSupabaseConfigured(): boolean {
  return Boolean(url && key)
}

export function getSupabaseClient(): SupabaseClient {
  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Create a .env file from .env.example and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    )
  }
  if (!client) {
    client = createClient(url, key)
  }
  return client
}

export function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'An unexpected error occurred.'
}

// ── Insert rate limiting ──
const insertTimestamps: number[] = []
const MAX_INSERTS_PER_MINUTE = 10
const MIN_INSERT_INTERVAL_MS = 3000

export async function insertPull(data: PullInsertPayload): Promise<void> {
  const now = Date.now()
  const oneMinuteAgo = now - 60000
  while (insertTimestamps.length > 0 && insertTimestamps[0] < oneMinuteAgo) {
    insertTimestamps.shift()
  }
  if (insertTimestamps.length >= MAX_INSERTS_PER_MINUTE) {
    throw new Error('Rate limit: max 10 pulls per minute. Please slow down.')
  }
  if (insertTimestamps.length > 0 && now - insertTimestamps[insertTimestamps.length - 1] < MIN_INSERT_INTERVAL_MS) {
    throw new Error('Please wait a few seconds between submissions.')
  }

  const supabase = getSupabaseClient()
  const { error } = await supabase.from('nte_pulls').insert(data)
  if (error) {
    throw new Error(error.message)
  }
  insertTimestamps.push(now)
}

// ── Per-function fetch rate limiting ──
function makeRateLimiter(minIntervalMs: number) {
  let lastFetchTime = 0
  return function canFetch(): boolean {
    const now = Date.now()
    if (now - lastFetchTime < minIntervalMs) {
      return false
    }
    lastFetchTime = now
    return true
  }
}

const canFetchAllPulls = makeRateLimiter(15000)
const canFetchRecent = makeRateLimiter(10000)
const canFetchStats = makeRateLimiter(15000)

export async function fetchAllPulls(limit = 2000): Promise<PullRow[]> {
  if (!canFetchAllPulls()) {
    throw new Error('Please wait a moment before refreshing.')
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('nte_pulls')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<PullRow[]>()
  if (error) {
    throw new Error(error.message)
  }
  return data ?? []
}

export async function fetchSecondStats(): Promise<SecondStatsRow[]> {
  if (!canFetchStats()) {
    throw new Error('Please wait a moment before refreshing.')
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('nte_second_stats')
    .select('*')
    .returns<SecondStatsRow[]>()
  if (error) {
    throw new Error(error.message)
  }
  return data ?? []
}

export async function fetchRecentPulls(limit = 50): Promise<PullRow[]> {
  if (!canFetchRecent()) {
    throw new Error('Please wait a moment before refreshing.')
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('nte_pulls')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<PullRow[]>()
  if (error) {
    throw new Error(error.message)
  }
  return data ?? []
}
