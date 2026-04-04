/**
 * Shared crypto utilities for Uptime-LoFi backend
 */

/**
 * Calculate SHA-256 hash of a string value.
 * Used for generating node salts and secure identifiers.
 *
 * @param value - The string to hash
 * @returns Hex-encoded SHA-256 hash
 */
export async function calculateHash(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a random salt for node authentication.
 *
 * @param length - Number of bytes (default: 16)
 * @returns Hex-encoded random salt
 */
export function generateSalt(length: number = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}
