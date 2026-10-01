/**
 * The `dsh-nanomuse` root row: the host side of the browser half.
 *
 * The browser half (`exports["./client"]`) rides on this row — the client
 * module system attaches a package's `dsh.client` bundle to the Loader row
 * whose specifier is the bare package name — and it needs the agent's face:
 * the dragon stills under `assets/`, served at `/nanomuse/assets/<file>` when
 * a web server is present. The cloud service is its own row (`dsh-nanomuse/cloud`).
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

export const name = 'nanomuse'

/** Where the browser asks for the stills. */
export const ASSETS_PREFIX = '/nanomuse/assets'

const ASSETS_DIR = fileURLToPath(new URL('../assets/', import.meta.url))
const TYPES: Record<string, string> = { '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' }

export function apply(ctx: Context): void {
  ctx.inject(['webServer'], (ctx) => {
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: ASSETS_PREFIX, handler: serveAsset }), 'nanomuse: assets')
  })
}

/** One file from `assets/` by its base name; anything else is 404. */
export async function serveAsset(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const file = basename(url.pathname)
  const ext = file.slice(file.lastIndexOf('.'))
  const type = TYPES[ext]
  if (!type || (req.method !== 'GET' && req.method !== 'HEAD') || file !== url.pathname.slice(ASSETS_PREFIX.length + 1)) {
    res.writeHead(404, { 'cache-control': 'no-store' }).end()
    return
  }
  const path = join(ASSETS_DIR, file)
  let size: number
  try {
    size = (await stat(path)).size
  } catch {
    res.writeHead(404, { 'cache-control': 'no-store' }).end()
    return
  }
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'cache-control': 'public, max-age=86400' })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(path).pipe(res)
}
