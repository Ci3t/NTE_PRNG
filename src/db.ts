import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type {
  PullInsertPayload,
  PullRow,
  SecondStatsRow,
  DateFilter,
  ServerRegion,
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

// ── Date filter helpers ──
export function getDateRange(filter: DateFilter): { start: string; end: string } | null {
  if (filter === 'all') return null
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  if (filter === 'today') {
    return { start: startOfToday.toISOString(), end: endOfToday.toISOString() }
  }
  if (filter === 'yesterday') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    return { start: start.toISOString(), end: startOfToday.toISOString() }
  }
  if (filter === 'last7') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
    return { start: start.toISOString(), end: endOfToday.toISOString() }
  }
  if (filter === 'week') {
    // Monday-based ISO week
    const dayOfWeek = now.getDay() // 0=Sun, 1=Mon
    const daysSinceMonday = (dayOfWeek + 6) % 7
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday)
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday + 7)
    return { start: start.toISOString(), end: end.toISOString() }
  }
  return null
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

export async function fetchAllPulls(
  dateFilter: DateFilter = 'all',
  serverRegion: ServerRegion | 'all' = 'all',
  limit = 2000,
  force = false
): Promise<PullRow[]> {
  if (!force && !canFetchAllPulls()) {
    throw new Error('Please wait a moment before refreshing.')
  }
  const supabase = getSupabaseClient()
  let query = supabase
    .from('nte_pulls')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  const range = getDateRange(dateFilter)
  if (range) {
    query = query.gte('logged_client_at', range.start).lt('logged_client_at', range.end)
  }

  if (serverRegion !== 'all') {
    query = query.eq('server_region', serverRegion)
  }

  const { data, error } = await query.returns<PullRow[]>()
  if (error) {
    throw new Error(error.message)
  }
  return data ?? []
}

export async function fetchSecondStats(force = false): Promise<SecondStatsRow[]> {
  if (!force && !canFetchStats()) {
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

export async function fetchRecentPulls(
  serverRegion: ServerRegion | 'all' = 'all',
  limit = 50,
  force = false
): Promise<PullRow[]> {
  if (!force && !canFetchRecent()) {
    throw new Error('Please wait a moment before refreshing.')
  }
  const supabase = getSupabaseClient()
  let query = supabase
    .from('nte_pulls')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (serverRegion !== 'all') {
    query = query.eq('server_region', serverRegion)
  }

  const { data, error } = await query.returns<PullRow[]>()
  if (error) {
    throw new Error(error.message)
  }
  return data ?? []
}
