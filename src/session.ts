import type { ServerRegion, PullMode, LogMode } from './types.ts'

const SESSION_KEY = 'nte_session_id'
const USER_TAG_KEY = 'nte_user_tag'
const SERVER_KEY = 'nte_server_region'
const MODE_KEY = 'nte_pull_mode'
const LOG_MODE_KEY = 'nte_log_mode'

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = generateUUID()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export function getUserTag(): string {
  return localStorage.getItem(USER_TAG_KEY) ?? ''
}

export function setUserTag(tag: string): void {
  localStorage.setItem(USER_TAG_KEY, tag.trim())
}

export function getServerRegion(): ServerRegion {
  const val = localStorage.getItem(SERVER_KEY) as ServerRegion | null
  if (val && (val === 'EU' || val === 'NA' || val === 'Asia')) {
    return val
  }
  return 'EU'
}

export function setServerRegion(region: ServerRegion): void {
  localStorage.setItem(SERVER_KEY, region)
}

export function getPullMode(): PullMode {
  const val = localStorage.getItem(MODE_KEY) as PullMode | null
  if (val === 'free' || val === 'stamina') return val
  return 'free'
}

export function setPullMode(mode: PullMode): void {
  localStorage.setItem(MODE_KEY, mode)
}

export function getLogMode(): LogMode {
  const val = localStorage.getItem(LOG_MODE_KEY) as LogMode | null
  if (val === 'single' || val === 'bulk' || val === 'stack') return val
  return 'single'
}

export function setLogMode(mode: LogMode): void {
  localStorage.setItem(LOG_MODE_KEY, mode)
}
