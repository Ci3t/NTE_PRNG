const SESSION_KEY = 'nte_session_id'
const USER_TAG_KEY = 'nte_user_tag'

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
