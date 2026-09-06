import { createHash } from 'node:crypto'

// The persisted version prevents old JWTs reviving when identity/role values return.
export function sessionStamp(user: { id: string; email: string | null; password: string | null; role: string; sessionVersion: number }) {
  return createHash('sha256').update(JSON.stringify([user.id, user.email, user.password, user.role, user.sessionVersion])).digest('base64url')
}
