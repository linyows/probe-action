import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as cache from '@actions/cache'
import { resolveVersion, sanitizeVersion, normalizeBool } from './resolve-version'
import { detectPlatform, ensureProbeBinary, parsePaths } from './run'

export async function run(): Promise<void> {
  const pathInput = core.getInput('path')
  const pathsInput = core.getInput('paths')
  const versionInput = core.getInput('version') || 'latest'
  const options = core.getInput('options')
  const workdir = core.getInput('workdir')
  const debug = normalizeBool(core.getInput('action-debug'))
  const cacheEnabled = core.getInput('cache') !== 'false'
  const token = core.getInput('github-token') || process.env.GITHUB_TOKEN

  // Determine the workflow files to run.
  const paths = parsePaths(pathInput, pathsInput)
  if (paths.length === 0) {
    throw new Error("Either 'path' or 'paths' input must be provided")
  }

  const platform = detectPlatform()
  if (debug) core.info(`Detected platform: ${platform.os}_${platform.arch}`)

  const version = sanitizeVersion(
    await resolveVersion(versionInput, { token, debug }),
  )
  if (debug) core.info(`Using probe version: ${version}`)

  // The binary lives in a stable directory under RUNNER_TEMP so it can be
  // persisted across runs via actions/cache.
  const runnerTemp = process.env.RUNNER_TEMP || os.tmpdir()
  const probeDir = path.join(runnerTemp, 'probe-cache')
  const cacheKey = `probe-${process.env.RUNNER_OS}-${process.env.RUNNER_ARCH}-${version}`

  let cacheHit = false
  if (cacheEnabled) {
    try {
      const restored = await cache.restoreCache([probeDir], cacheKey)
      cacheHit = restored !== undefined
      if (debug) core.info(cacheHit ? `Cache restored: ${cacheKey}` : 'Cache not found')
    } catch (err) {
      core.warning(`Cache restore failed: ${String(err)}`)
    }
  }

  const binary = await ensureProbeBinary({ version, probeDir, platform, debug })

  // Save the cache only on a miss, so a fresh download is persisted for reuse.
  if (cacheEnabled && !cacheHit) {
    try {
      await cache.saveCache([probeDir], cacheKey)
      if (debug) core.info(`Cache saved: ${cacheKey}`)
    } catch (err) {
      core.warning(`Cache save failed: ${String(err)}`)
    }
  }

  // Resolve the working directory (relative to the original working directory).
  const cwd = workdir ? path.resolve(process.cwd(), workdir) : process.cwd()
  if (workdir && !fs.existsSync(cwd)) {
    throw new Error(`Working directory does not exist: ${workdir}`)
  }
  if (debug && workdir) core.info(`Changed to working directory: ${cwd}`)

  // probe options are passed through verbatim, split on whitespace.
  const args = options.trim().length > 0 ? options.trim().split(/\s+/) : []

  for (const p of paths) {
    const workflow = path.isAbsolute(p) ? p : path.join(cwd, p)
    if (!fs.existsSync(workflow)) {
      throw new Error(`Workflow file not found: ${p}`)
    }

    if (debug) {
      core.info(`Running probe with workflow: ${p}`)
      core.info(`Command: FORCE_COLOR=1 ${binary} ${[...args, p].join(' ')}`)
    }

    await exec.exec(binary, [...args, p], {
      cwd,
      env: { ...process.env, FORCE_COLOR: '1' },
    })

    // Blank line between multiple workflow executions for clarity.
    if (paths.length > 1) core.info('')
  }
}

run().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err))
})
