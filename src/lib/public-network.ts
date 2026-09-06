import { request as httpsRequest } from 'node:https'
import { lookup } from 'node:dns'
import { isIP } from 'node:net'
import { Readable, Transform } from 'node:stream'

export function isPublicAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, '')
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) ||
      (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0))
  }
  // Global-unicast only. This also rejects IPv4-mapped and translation ranges.
  return isIP(ip) === 6 && /^[23][0-9a-f]{3}:/.test(ip) &&
    !ip.startsWith('2001:db8:') && !/^2001:(?:0:|:)/.test(ip) && !ip.startsWith('2002:')
}

export function validatePublicUrl(raw: string) {
  const url = new URL(raw)
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port && url.port !== '443') {
    throw new Error('仅支持标准端口的公网 HTTPS 地址')
  }
  if (isIP(host) ? !isPublicAddress(host) : !host.includes('.') || /(?:^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(host)) {
    throw new Error('不允许访问本地或内网地址')
  }
  return url
}

// Validate the addresses actually used for the TLS connection, not a separate
// DNS preflight (which would remain vulnerable to DNS rebinding).
export async function publicFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init)
  const url = validatePublicUrl(request.url)
  const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined
  if (body && body.length > 4 * 1024 * 1024) throw new Error('外部请求内容过大')
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, {
      method: request.method,
      headers: { ...Object.fromEntries(request.headers), 'accept-encoding': 'identity' },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(90000)]),
      lookup(host, options, callback) {
        lookup(host, { all: true, verbatim: true }, (error, addresses) => {
          if (error) return callback(error, '', 4)
          if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) {
            return callback(new Error('域名解析到了非公网地址'), '', 4)
          }
          if (typeof options === 'object' && options.all) callback(null, addresses)
          else callback(null, addresses[0].address, addresses[0].family)
        })
      },
    }, (res) => {
      const status = res.statusCode || 502
      if (status >= 300 && status < 400) {
        res.destroy()
        reject(new Error('外部服务重定向已拒绝'))
        return
      }
      const headers = new Headers()
      for (const [key, value] of Object.entries(res.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
      }
      let size = 0
      const bounded = new Transform({ transform(chunk, _encoding, callback) {
        size += chunk.length
        callback(size > 16 * 1024 * 1024 ? new Error('外部响应过大') : null, chunk)
      } })
      res.on('error', error => bounded.destroy(error))
      bounded.on('close', () => res.destroy())
      const stream = res.pipe(bounded)
      resolve(new Response([204, 205, 304].includes(status) ? null : Readable.toWeb(stream) as ReadableStream, { status, headers }))
    })
    req.on('error', reject)
    req.end(body)
  })
}
