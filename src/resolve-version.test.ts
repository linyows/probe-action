import { describe, it, expect, vi } from 'vitest'
import {
  resolveVersion,
  sanitizeVersion,
  normalizeVersionTag,
  normalizeBool,
  FALLBACK_VERSION,
} from './resolve-version'

describe('normalizeBool', () => {
  it('treats true/1/yes (any case) as true', () => {
    for (const v of ['true', 'TRUE', 'True', '1', 'yes', 'YES']) {
      expect(normalizeBool(v)).toBe(true)
    }
  })

  it('treats everything else as false', () => {
    for (const v of ['false', '0', 'no', '', undefined, '  ']) {
      expect(normalizeBool(v)).toBe(false)
    }
  })
})

describe('sanitizeVersion', () => {
  it('keeps only the first line and strips CR', () => {
    expect(sanitizeVersion('v1.2.3\r\nextra')).toBe('v1.2.3')
    expect(sanitizeVersion('  v1.2.3  ')).toBe('v1.2.3')
  })
})

describe('normalizeVersionTag', () => {
  it('prefixes a leading v to bare semver', () => {
    expect(normalizeVersionTag('0.20.1')).toBe('v0.20.1')
  })

  it('leaves an existing v-prefixed tag unchanged', () => {
    expect(normalizeVersionTag('v0.20.1')).toBe('v0.20.1')
  })

  it('leaves non-semver values unchanged', () => {
    expect(normalizeVersionTag('latest')).toBe('latest')
    expect(normalizeVersionTag('main')).toBe('main')
  })
})

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response
}

describe('resolveVersion', () => {
  it('returns a concrete tag unchanged without hitting the API', async () => {
    const fetchImpl = vi.fn()
    const out = await resolveVersion('v0.20.1', { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(out).toBe('v0.20.1')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('resolves "latest" from the GitHub API', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ tag_name: 'v9.9.9' }))
    const out = await resolveVersion('latest', { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(out).toBe('v9.9.9')
  })

  it('sends an Authorization header when a token is provided', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ tag_name: 'v1.0.0' }))
    await resolveVersion('latest', {
      token: 'secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const [, init] = fetchImpl.mock.calls[0]
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'token secret',
    })
  })

  it('falls back when the API responds without a tag_name', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}))
    const out = await resolveVersion('latest', { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(out).toBe(FALLBACK_VERSION)
  })

  it('falls back when the API request fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })
    const out = await resolveVersion('latest', { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(out).toBe(FALLBACK_VERSION)
  })

  it('falls back on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 403))
    const out = await resolveVersion('latest', { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(out).toBe(FALLBACK_VERSION)
  })
})
