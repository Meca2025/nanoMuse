/**
 * The `dsh-nanomuse` root row: the host side of the browser half.
 *
 * The browser half (`exports["./client"]`) rides on this row — the client
 * module system attaches a package's `dsh.client` bundle to the Loader row
 * whose specifier is the bare package name — and it needs the agent's face:
 * the dragon stills under `assets/`, served at `/nanomuse/assets/<file>`, and
 * the stills of a face drawn on the phone and pulled from the account, served
 * at `/nanomuse/assets/face/<id>/<mood>.webp` from `$DSH_HOME/nanomuse/faces/`
 * when a web server is present. The cloud service is its own row
 * (`dsh-nanomuse/cloud`); the face files are read through its profile store.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from './cloud.ts'

export const name = 'nanomuse'

/** Where the browser asks for the stills. */
export const ASSETS_PREFIX = '/nanomuse/assets'

const ASSETS_DIR = fileURLToPath(new URL('../assets/', import.meta.url))
const TYPES: Record<string, string> = { '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' }
const FACE = /^\/face\/([a-f0-9]{6,40})\/([a-z]+)\.webp$/

export function apply(ctx: Context): void {
  ctx.inject(['webServer'], (ctx) => {
    const handler = (req: IncomingMessage, res: ServerResponse) => serveAsset(req, res, (id, mood) => ctx.get('nanomuseCloud')?.profile.stillPath(id, mood))
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: ASSETS_PREFIX, handler }), 'nanomuse: assets')
  })
}

/** One file from `assets/` by its base name, or a still of the account's face; anything else is 404. */
export async function serveAsset(req: IncomingMessage, res: ServerResponse, facePath?: (id: string, mood: string) => string | undefined): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const rel = url.pathname.slice(ASSETS_PREFIX.length)
  if (req.method !== 'GET' && req.method !== 'HEAD') return notFound(res)
  const face = FACE.exec(rel)
  let path: string | undefined
  let type: string | undefined
  if (face) {
    path = facePath?.(face[1] ?? '', face[2] ?? '')
    type = TYPES['.webp']
  } else {
    const file = basename(url.pathname)
    const ext = file.slice(file.lastIndexOf('.'))
    type = TYPES[ext]
    if (type && file === rel.slice(1)) path = join(ASSETS_DIR, file)
  }
  if (!path || !type) return notFound(res)
  let size: number
  try {
    size = (await stat(path)).size
  } catch {
    return notFound(res)
  }
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'cache-control': face ? 'public, max-age=3600' : 'public, max-age=86400' })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(path).pipe(res)
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { 'cache-control': 'no-store' }).end()
}
