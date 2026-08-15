import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const size = 256

function crc32(buf) {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data])
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), 8 + data.length)
  return out
}

const raw = Buffer.alloc(size * (1 + size * 4))
for (let y = 0; y < size; y += 1) {
  const row = y * (1 + size * 4)
  raw[row] = 0
  for (let x = 0; x < size; x += 1) {
    const dx = x - 127.5
    const dy = y - 127.5
    const r = Math.hypot(dx, dy)
    const o = row + 1 + x * 4
    const inside = r < 118
    const ring = r > 98 && r < 112
    raw[o] = ring ? 255 : inside ? 31 : 0
    raw[o + 1] = ring ? 255 : inside ? 111 : 0
    raw[o + 2] = ring ? 255 : inside ? 235 : 0
    raw[o + 3] = inside ? 255 : 0
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(size, 0)
ihdr.writeUInt32BE(size, 4)
ihdr[8] = 8
ihdr[9] = 6

mkdirSync(join(root, 'build'), { recursive: true })
writeFileSync(
  join(root, 'build', 'icon.png'),
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]),
)
