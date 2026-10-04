import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  detectPlatform,
  parseChecksums,
  parsePaths,
  sha256File,
  verifyChecksum,
} from './run'

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

// sha256("hello\n")
const HELLO_SHA256 =
  '5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03'

describe('parseChecksums', () => {
  it('parses goreleaser checksum lines', () => {
    const sums = parseChecksums(
      `${'a'.repeat(64)}  probe_linux_x86_64.tar.gz\n` +
        `${'B'.repeat(64)}  probe_linux_arm64.tar.gz\n`,
    )
    expect(sums.get('probe_linux_x86_64.tar.gz')).toBe('a'.repeat(64))
    expect(sums.get('probe_linux_arm64.tar.gz')).toBe('b'.repeat(64))
  })

  it('accepts binary-mode markers and CRLF line endings', () => {
    const sums = parseChecksums(`${'c'.repeat(64)} *probe.tar.gz\r\n`)
    expect(sums.get('probe.tar.gz')).toBe('c'.repeat(64))
  })

  it('ignores malformed lines', () => {
    const sums = parseChecksums('not a checksum\n\nabc  short.tar.gz\n')
    expect(sums.size).toBe(0)
  })
})

describe('checksum verification', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-action-test-'))
    file = path.join(dir, 'probe.tar.gz')
    fs.writeFileSync(file, 'hello\n')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('computes the sha256 of a file', async () => {
    expect(await sha256File(file)).toBe(HELLO_SHA256)
  })

  it('passes when the digest matches', async () => {
    const sums = `${HELLO_SHA256}  probe.tar.gz\n`
    await expect(verifyChecksum(file, 'probe.tar.gz', sums)).resolves.toBe(
      HELLO_SHA256,
    )
  })

  it('compares digests case-insensitively', async () => {
    const sums = `${HELLO_SHA256.toUpperCase()}  probe.tar.gz\n`
    await expect(verifyChecksum(file, 'probe.tar.gz', sums)).resolves.toBe(
      HELLO_SHA256,
    )
  })

  it('throws on a digest mismatch', async () => {
    const sums = `${'0'.repeat(64)}  probe.tar.gz\n`
    await expect(verifyChecksum(file, 'probe.tar.gz', sums)).rejects.toThrow(
      /Checksum mismatch/,
    )
  })

  it('throws when the asset is not listed', async () => {
    const sums = `${HELLO_SHA256}  other.tar.gz\n`
    await expect(verifyChecksum(file, 'probe.tar.gz', sums)).rejects.toThrow(
      /not found in checksums.txt/,
    )
  })
})
