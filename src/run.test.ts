import { describe, it, expect } from 'vitest'
import { detectPlatform, parsePaths } from './run'

describe('detectPlatform', () => {
  it('maps x64 to x86_64 on linux', () => {
    expect(detectPlatform('linux', 'x64')).toEqual({ os: 'linux', arch: 'x86_64' })
  })

  it('maps arm64 to arm64 on linux', () => {
    expect(detectPlatform('linux', 'arm64')).toEqual({ os: 'linux', arch: 'arm64' })
  })

  it('rejects non-linux platforms', () => {
    expect(() => detectPlatform('darwin', 'arm64')).toThrow(/only Linux/)
  })

  it('rejects unsupported architectures', () => {
    expect(() => detectPlatform('linux', 'ia32')).toThrow(/Unsupported architecture/)
  })
})

describe('parsePaths', () => {
  it('returns a single path from the path input', () => {
    expect(parsePaths('test/a.yml', '')).toEqual(['test/a.yml'])
  })

  it('prefers paths over path and splits on newlines', () => {
    expect(parsePaths('ignored.yml', 'a.yml\nb.yml')).toEqual(['a.yml', 'b.yml'])
  })

  it('drops empty lines and trims whitespace', () => {
    expect(parsePaths('', '  a.yml \n\n   \n b.yml ')).toEqual(['a.yml', 'b.yml'])
  })

  it('strips surrounding quotes', () => {
    expect(parsePaths('"quoted.yml"', '')).toEqual(['quoted.yml'])
  })

  it('handles Windows-style CRLF line endings', () => {
    expect(parsePaths('', 'a.yml\r\nb.yml\r\n')).toEqual(['a.yml', 'b.yml'])
  })

  it('returns an empty array when nothing is provided', () => {
    expect(parsePaths('', '')).toEqual([])
    expect(parsePaths('   ', '  ')).toEqual([])
  })
})
