import { createHash } from 'node:crypto';

/** Preserve JSON field/array order so existing idempotency hashes stay valid. */
export function hashRequest(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
