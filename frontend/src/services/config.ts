const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000'

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? DEFAULT_API_BASE_URL

export function websocketUrl(path: string): string {
  const url = new URL(path, API_BASE_URL)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}
