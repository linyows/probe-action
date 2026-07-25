import * as core from '@actions/core'

// Fallback used when "latest" cannot be resolved from the GitHub API
// (e.g. rate limit, auth error, or network failure).
export const FALLBACK_VERSION = 'v0.20.1'

// Normalize an action-debug style flag: true/1/yes (case-insensitive) => true.
export function normalizeBool(value: string | undefined): boolean {
  const s = (value ?? '').trim().toLowerCase()
  return s === 'true' || s === '1' || s === 'yes'
}

// Keep only the first line and strip CR so a stray newline in the input cannot
// corrupt the cache key or the download URL built from the version.
export function sanitizeVersion(value: string): string {
  return value.split('\n')[0].replace(/\r/g, '').trim()
}

export interface ResolveOptions {
  token?: string
  debug?: boolean
  fetchImpl?: typeof fetch
}

// Resolve a probe version to a concrete release tag.
// "latest" is resolved via the GitHub API; a concrete tag is returned as-is.
export async function resolveVersion(
  version: string,
  opts: ResolveOptions = {},
): Promise<string> {
  const { token, debug = false, fetchImpl = fetch } = opts

  // Concrete version: nothing to resolve.
  if (version !== 'latest') {
    return version
  }

  if (debug) core.info('Fetching latest version from GitHub API...')

  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
    }
    // Authenticate when a token is available to avoid API rate limiting.
    if (token) headers.Authorization = `token ${token}`

    const res = await fetchImpl(
      'https://api.github.com/repos/linyows/probe/releases/latest',
      { headers },
    )
    if (res.ok) {
      const data = (await res.json()) as { tag_name?: string }
      const tag = data.tag_name?.trim()
      if (tag) {
        if (debug) core.info(`Successfully fetched version: ${tag}`)
        return tag
      }
    } else if (debug) {
      core.info(`GitHub API returned status ${res.status}`)
    }
  } catch (err) {
    if (debug) core.info(`Failed to fetch from API: ${String(err)}`)
  }

  if (debug) {
    core.info(`Failed to fetch from API, using fallback version ${FALLBACK_VERSION}`)
  }
  return FALLBACK_VERSION
}
