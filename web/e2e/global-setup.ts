import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const startupTimeoutMs = 10_000

/**
 * Starts the built binary for the journeys and returns the teardown that
 * stops it.
 *
 * The binary gets PORT=0, so the OS picks a free port, and the address comes
 * from its "listening" log line. That way any number of suites can run at
 * once without colliding. It runs in an empty temporary directory, which also
 * proves it needs nothing from the repo at runtime.
 *
 * Set CUBULAR_BIN to test another binary, CUBULAR_BASE_URL to skip starting
 * one, and CUBULAR_E2E_LOGS=1 to see the server's logs.
 */
export default async function globalSetup(): Promise<(() => Promise<void>) | undefined> {
  if (process.env.CUBULAR_BASE_URL) return undefined

  const bin = path.resolve(process.env.CUBULAR_BIN ?? path.join(repoRoot, 'bin', 'cubular'))
  if (!existsSync(bin)) {
    throw new Error(`${bin} does not exist. Run \`make build\` first, or set CUBULAR_BIN.`)
  }

  const workDir = await mkdtemp(path.join(tmpdir(), 'cubular-e2e-'))
  const server = spawn(bin, [], {
    cwd: workDir,
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  })

  try {
    const port = await waitForListeningPort(server)
    process.env.CUBULAR_BASE_URL = `http://127.0.0.1:${port}`
  } catch (err) {
    await stop(server)
    await rm(workDir, { recursive: true, force: true })
    throw err
  }

  return async () => {
    await stop(server)
    await rm(workDir, { recursive: true, force: true })
  }
}

/** Reads the server's JSON log lines until it reports the port it bound. */
function waitForListeningPort(server: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    const seen: string[] = []
    const timer = setTimeout(() => {
      reject(new Error(`server did not start within ${startupTimeoutMs} ms. Output:\n${seen.join('\n')}`))
    }, startupTimeoutMs)
    server.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`server exited with code ${code} before listening. Output:\n${seen.join('\n')}`))
    })

    // Keep draining stdout for the server's whole life, or a full pipe
    // would block its logging.
    const lines = createInterface({ input: server.stdout! })
    lines.on('line', (line) => {
      if (process.env.CUBULAR_E2E_LOGS) console.error(`[cubular] ${line}`)
      seen.push(line)
      const port = listeningPort(line)
      if (port !== undefined) {
        clearTimeout(timer)
        resolve(port)
      }
    })
  })
}

function listeningPort(line: string): number | undefined {
  let entry: unknown
  try {
    entry = JSON.parse(line)
  } catch {
    return undefined
  }
  if (typeof entry !== 'object' || entry === null) return undefined
  const { msg, addr } = entry as { msg?: unknown; addr?: unknown }
  if (msg !== 'listening' || typeof addr !== 'string') return undefined
  const port = Number(addr.slice(addr.lastIndexOf(':') + 1))
  return Number.isInteger(port) && port > 0 ? port : undefined
}

async function stop(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.signalCode !== null) return
  const exited = new Promise<void>((resolve) => server.once('exit', () => resolve()))
  server.kill('SIGTERM')
  await exited
}
