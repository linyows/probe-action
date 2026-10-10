import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkMode,
  detectPlatform,
  ensureProbeBinary,
  parseChecksums,
  parsePaths,
  sha256File,
  verifyChecksum,
} from './run'

describe('detectPlatform', () => {
  it('maps x64 to x86_64 on linux', () => {
    expect(detectPlatform('linux', 'x64')).toEqual({
      os: 'linux',
      arch: 'x86_64',
    })
  })

  it('maps arm64 to arm64 on linux', () => {
    expect(detectPlatform('linux', 'arm64')).toEqual({
      os: 'linux',
      arch: 'arm64',
    })
  })

  it('rejects non-linux platforms', () => {
    expect(() => detectPlatform('darwin', 'arm64')).toThrow(/only Linux/)
  })

  it('rejects unsupported architectures', () => {
    expect(() => detectPlatform('linux', 'ia32')).toThrow(
      /Unsupported architecture/,
    )
  })
})

describe('parsePaths', () => {
  it('returns a single path from the path input', () => {
    expect(parsePaths('test/a.yml', '')).toEqual(['test/a.yml'])
  })

  it('prefers paths over path and splits on newlines', () => {
    expect(parsePaths('ignored.yml', 'a.yml\nb.yml')).toEqual([
      'a.yml',
      'b.yml',
    ])
  })

  it('drops empty lines and trims whitespace', () => {
    expect(parsePaths('', '  a.yml \n\n   \n b.yml ')).toEqual([
      'a.yml',
      'b.yml',
    ])
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

describe('checkMode', () => {
  it('accepts workflows to run', () => {
    expect(() => checkMode(['a.yml'], false)).not.toThrow()
  })

  it('accepts install-only without a workflow', () => {
    expect(() => checkMode([], true)).not.toThrow()
  })

  it('rejects running nothing without install-only', () => {
    expect(() => checkMode([], false)).toThrow(/'path' or 'paths'/)
  })

  it('rejects install-only with a workflow', () => {
    expect(() => checkMode(['a.yml'], true)).toThrow(/install-only/)
  })
})

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

describe('ensureProbeBinary', () => {
  const platform = { os: 'linux', arch: 'x86_64' }
  const assetName = 'probe_linux_x86_64.tar.gz'
  let root: string
  let probeDir: string
  let goodArchive: string
  let checksums: string

  // Fake downloader serving checksums.txt and the release archive.
  function makeDownload(archiveSource = goodArchive) {
    return vi.fn(async (url: string, dest?: string) => {
      const out = dest ?? path.join(root, `dl-${Math.random()}`)
      if (url.endsWith('/checksums.txt')) {
        fs.writeFileSync(out, checksums)
      } else {
        fs.copyFileSync(archiveSource, out)
      }
      return out
    })
  }

  function archiveCalls(download: ReturnType<typeof makeDownload>) {
    return download.mock.calls.filter(([url]) => url.endsWith(assetName))
  }

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-action-ensure-'))
    probeDir = path.join(root, 'probe-cache')
    const src = path.join(root, 'src')
    fs.mkdirSync(src)
    fs.writeFileSync(path.join(src, 'probe'), '#!/bin/sh\necho v1.0.0\n')
    goodArchive = path.join(root, 'good.tar.gz')
    execFileSync('tar', ['-czf', goodArchive, '-C', src, 'probe'])
    checksums = `${await sha256File(goodArchive)}  ${assetName}\n`
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('downloads, verifies, and extracts on a cache miss', async () => {
    const download = makeDownload()
    const binary = await ensureProbeBinary({
      version: 'v1.0.0',
      probeDir,
      platform,
      downloadImpl: download,
    })
    expect(fs.existsSync(binary)).toBe(true)
    expect(path.dirname(path.dirname(binary))).toBe(root)
    expect(binary.startsWith(probeDir)).toBe(false)
    expect(fs.existsSync(path.join(probeDir, assetName))).toBe(true)
    expect(archiveCalls(download)).toHaveLength(1)
  })

  it('reuses a cached archive that passes verification', async () => {
    fs.mkdirSync(probeDir)
    fs.copyFileSync(goodArchive, path.join(probeDir, assetName))
    const download = makeDownload()
    const binary = await ensureProbeBinary({
      version: 'v1.0.0',
      probeDir,
      platform,
      downloadImpl: download,
    })
    expect(fs.existsSync(binary)).toBe(true)
    expect(archiveCalls(download)).toHaveLength(0)
    // checksums.txt is always fetched from the release, never trusted from cache.
    expect(download).toHaveBeenCalledWith(
      expect.stringMatching(/checksums\.txt$/),
    )
  })

  it('re-downloads when the cached archive has been tampered with', async () => {
    fs.mkdirSync(probeDir)
    fs.writeFileSync(path.join(probeDir, assetName), 'tampered')
    const download = makeDownload()
    const binary = await ensureProbeBinary({
      version: 'v1.0.0',
      probeDir,
      platform,
      downloadImpl: download,
    })
    expect(fs.readFileSync(binary, 'utf8')).toContain('echo v1.0.0')
    expect(archiveCalls(download)).toHaveLength(1)
    expect(await sha256File(path.join(probeDir, assetName))).toBe(
      await sha256File(goodArchive),
    )
  })

  it('never uses a binary left in the cache directory', async () => {
    fs.mkdirSync(probeDir)
    fs.copyFileSync(goodArchive, path.join(probeDir, assetName))
    fs.writeFileSync(path.join(probeDir, 'probe'), '#!/bin/sh\necho evil\n')
    const binary = await ensureProbeBinary({
      version: 'v1.0.0',
      probeDir,
      platform,
      downloadImpl: makeDownload(),
    })
    expect(fs.readFileSync(binary, 'utf8')).toContain('echo v1.0.0')
  })

  it('fails and removes the archive when the download does not verify', async () => {
    const bad = path.join(root, 'bad.tar.gz')
    fs.writeFileSync(bad, 'corrupted')
    await expect(
      ensureProbeBinary({
        version: 'v1.0.0',
        probeDir,
        platform,
        downloadImpl: makeDownload(bad),
      }),
    ).rejects.toThrow(/Checksum mismatch/)
    expect(fs.existsSync(path.join(probeDir, assetName))).toBe(false)
  })

  it('fails when checksums.txt cannot be fetched, even with a cached archive', async () => {
    fs.mkdirSync(probeDir)
    fs.copyFileSync(goodArchive, path.join(probeDir, assetName))
    const download = vi.fn(async () => {
      throw new Error('network down')
    })
    await expect(
      ensureProbeBinary({
        version: 'v1.0.0',
        probeDir,
        platform,
        downloadImpl: download,
      }),
    ).rejects.toThrow(/Failed to download checksums/)
  })
})
