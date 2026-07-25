import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'node:fs'
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

// Compare two version strings ignoring a leading "v".
function versionsMatch(a: string, b: string): boolean {
  return a.replace(/^v/, '') === b.replace(/^v/, '')
}

export interface EnsureOptions {
  version: string
  probeDir: string
  platform: Platform
  debug?: boolean
}

// Ensure a probe binary of the requested version exists in probeDir, downloading
// and extracting it when necessary. Returns the absolute path to the binary.
export async function ensureProbeBinary(opts: EnsureOptions): Promise<string> {
  const { version, probeDir, platform, debug = false } = opts

  fs.mkdirSync(probeDir, { recursive: true })
  const binary = path.join(probeDir, 'probe')

  // Skip download if an existing binary already matches the target version.
  if (fs.existsSync(binary)) {
    const existing = await getBinaryVersion(binary)
    if (existing && versionsMatch(existing, version)) {
      if (debug) {
        core.info(
          `Existing probe binary matches version ${version}, skipping download`,
        )
      }
      return binary
    }
    if (debug) {
      core.info(
        `Existing probe version '${existing ?? 'unknown'}' does not match '${version}', re-downloading`,
      )
    }
  }

  const url = `https://github.com/linyows/probe/releases/download/${version}/probe_${platform.os}_${platform.arch}.tar.gz`
  if (debug) core.info(`Downloading from: ${url}`)

  let archive: string
  try {
    archive = await tc.downloadTool(url)
  } catch (err) {
    throw new Error(
      `Failed to download probe from ${url}: ${String(err)}\n` +
        'Please check if the version exists and supports your platform',
    )
  }

  await tc.extractTar(archive, probeDir)

  if (!fs.existsSync(binary)) {
    throw new Error(`probe binary not found after extraction in ${probeDir}`)
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
  return raw
    .split('\n')
    .map((p) => p.trim().replace(/^"|"$/g, '').trim())
    .filter((p) => p.length > 0)
}
