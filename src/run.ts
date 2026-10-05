import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as tc from '@actions/tool-cache'

export interface Platform {
  os: string
  arch: string
}

// Determine the OS and architecture in the naming scheme used by probe release
// archives. Only Linux is supported for now.
export function detectPlatform(
  platform: NodeJS.Platform = os.platform(),
  arch: string = os.arch(),
): Platform {
  if (platform !== 'linux') {
    throw new Error(
      `Currently only Linux is supported (detected OS: ${platform})`,
    )
  }

  switch (arch) {
    case 'x64':
      return { os: 'linux', arch: 'x86_64' }
    case 'arm64':
      return { os: 'linux', arch: 'arm64' }
    default:
      throw new Error(
        `Unsupported architecture: ${arch} (supported: x86_64, arm64)`,
      )
  }
}

// Read the version reported by an existing probe binary, or null if it cannot
// be determined.
export async function getBinaryVersion(binary: string): Promise<string | null> {
  try {
    let out = ''
    await exec.exec(binary, ['--version'], {
      silent: true,
      ignoreReturnCode: true,
      listeners: { stdout: (d) => (out += d.toString()) },
    })
    const m = out.match(/v?[0-9]+\.[0-9]+\.[0-9]+/)
    return m ? m[0] : null
  } catch {
    return null
  }
}

// Parse a goreleaser-style checksums file ("<sha256>  <filename>" per line)
// into a map of filename to lowercase hex digest.
export function parseChecksums(content: string): Map<string, string> {
  const sums = new Map<string, string>()
  for (const line of content.split(/\r?\n/)) {
    const m = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(\S+)$/)
    if (m) sums.set(m[2], m[1].toLowerCase())
  }
  return sums
}

// Compute the SHA-256 hex digest of a file.
export async function sha256File(file: string): Promise<string> {
  const hash = crypto.createHash('sha256')
  for await (const chunk of fs.createReadStream(file)) {
    hash.update(chunk as Buffer)
  }
  return hash.digest('hex')
}

// Verify that an archive matches the digest listed for assetName in the
// checksums file. Throws when the entry is missing or the digest differs.
export async function verifyChecksum(
  archive: string,
  assetName: string,
  checksumsContent: string,
): Promise<string> {
  const expected = parseChecksums(checksumsContent).get(assetName)
  if (!expected) {
    throw new Error(`Checksum for ${assetName} not found in checksums.txt`)
  }
  const actual = await sha256File(archive)
  if (actual !== expected) {
    throw new Error(
      `Checksum mismatch for ${assetName}: expected ${expected}, got ${actual}`,
    )
  }
  return actual
}

export interface EnsureOptions {
  version: string
  probeDir: string
  platform: Platform
  debug?: boolean
  downloadImpl?: (url: string, dest?: string) => Promise<string>
}

// Ensure a verified probe binary of the requested version is available and
// return its absolute path. probeDir holds only the release archive so it can be
// persisted via actions/cache. Because a restored cache cannot be trusted, the
// archive is verified against the release's checksums.txt on every run (the
// checksums are always fetched from the release, never from the cache), and the
// binary is extracted into a fresh directory outside probeDir.
export async function ensureProbeBinary(opts: EnsureOptions): Promise<string> {
  const {
    version,
    probeDir,
    platform,
    debug = false,
    downloadImpl = tc.downloadTool,
  } = opts

  fs.mkdirSync(probeDir, { recursive: true })

  const baseUrl = `https://github.com/linyows/probe/releases/download/${version}`
  const assetName = `probe_${platform.os}_${platform.arch}.tar.gz`
  const url = `${baseUrl}/${assetName}`
  const checksumsUrl = `${baseUrl}/checksums.txt`
  const archive = path.join(probeDir, assetName)

  let checksums: string
  try {
    checksums = fs.readFileSync(await downloadImpl(checksumsUrl), 'utf8')
  } catch (err) {
    throw new Error(
      `Failed to download checksums from ${checksumsUrl}: ${String(err)}`,
    )
  }

  let digest: string | undefined
  if (fs.existsSync(archive)) {
    try {
      digest = await verifyChecksum(archive, assetName, checksums)
      if (debug) core.info(`Cached archive verified: sha256:${digest}`)
    } catch (err) {
      core.warning(
        `Cached archive failed verification, re-downloading: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  if (!digest) {
    // Remove whatever is at the archive path (a stale or tampered file, or
    // anything else a restored cache left there) before downloading.
    fs.rmSync(archive, { recursive: true, force: true })
    if (debug) core.info(`Downloading from: ${url}`)
    try {
      await downloadImpl(url, archive)
    } catch (err) {
      throw new Error(
        `Failed to download probe from ${url}: ${String(err)}\n` +
          'Please check if the version exists and supports your platform',
      )
    }
    try {
      digest = await verifyChecksum(archive, assetName, checksums)
    } catch (err) {
      // Do not leave a bad archive behind to be cached.
      fs.rmSync(archive, { force: true })
      throw err
    }
    if (debug) core.info(`Checksum verified: sha256:${digest}`)
  }

  // Extract into a fresh directory next to probeDir (outside the cached path)
  // so nothing restored from the cache is ever executed.
  const binDir = fs.mkdtempSync(path.join(path.dirname(probeDir), 'probe-bin-'))
  await tc.extractTar(archive, binDir)

  const binary = path.join(binDir, 'probe')
  if (!fs.existsSync(binary)) {
    throw new Error(`probe binary not found after extraction in ${binDir}`)
  }
  fs.chmodSync(binary, 0o755)

  if (debug) {
    const v = await getBinaryVersion(binary)
    core.info(`Probe binary ready: ${v ?? 'version check failed'}`)
  }
  return binary
}

// Parse the path/paths inputs into a clean list of workflow file paths.
// GitHub Actions passes multiline strings verbatim, so "paths" may contain
// newline-separated entries. Surrounding quotes and whitespace are trimmed.
export function parsePaths(pathInput: string, pathsInput: string): string[] {
  const raw = pathsInput.trim().length > 0 ? pathsInput : pathInput
  // Split on \r?\n so Windows-style line endings do not leave a trailing \r.
  return raw
    .split(/\r?\n/)
    .map((p) => p.trim().replace(/^"|"$/g, '').trim())
    .filter((p) => p.length > 0)
}
