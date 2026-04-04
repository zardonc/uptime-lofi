/**
 * Shared crypto utilities for Uptime-LoFi backend
 * 
 * Password hashing uses PBKDF2-SHA256 with 10,000 iterations (~10ms CPU budget).
 * Token hashing uses single-iteration SHA-256 for non-password use cases.
 */

const PBKDF2_ITERATIONS = 10_000;

/**
 * Hash a password using PBKDF2-SHA256.
 *
 * @param password - The plaintext password
 * @param salt - Hex-encoded salt string
 * @param iterations - Number of PBKDF2 iterations (default: 10,000)
 * @returns Hex-encoded derived key (64 chars = 32 bytes)
 */
export async function hashPassword(
  password: string,
  salt: string,
  iterations: number = PBKDF2_ITERATIONS
): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const saltBytes = hexToBytes(salt);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256 // 32 bytes = 256 bits
  );

  return bytesToHex(new Uint8Array(derivedBits));
}

/**
 * Verify a password against a stored hash using constant-time comparison.
 *
 * @param password - The plaintext password to verify
 * @param storedHash - The hex-encoded stored hash
 * @param salt - Hex-encoded salt used during hashing
 * @param iterations - Number of PBKDF2 iterations (default: 10,000)
 * @returns true if password matches, false otherwise
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
  salt: string,
  iterations: number = PBKDF2_ITERATIONS
): Promise<boolean> {
  const computedHash = await hashPassword(password, salt, iterations);
  return timingSafeEqual(computedHash, storedHash);
}

/**
 * Generate a random salt.
 *
 * @param length - Number of bytes (default: 16)
 * @returns Hex-encoded random salt
 */
export function generateSalt(length: number = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a token using single-iteration SHA-256.
 * Used for non-password hashing (e.g., refresh tokens, API keys).
 * PBKDF2 is intentionally NOT used here since tokens are high-entropy
 * random values that don't benefit from key stretching.
 *
 * @param value - The token value to hash
 * @returns Hex-encoded SHA-256 hash
 */
export async function hashToken(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hashBuffer));
}

// --- Internal helpers ---

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
