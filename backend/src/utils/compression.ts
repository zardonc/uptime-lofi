/**
 * Compression utilities for containers_json payload reduction.
 * Uses Cloudflare Workers native CompressionStream (gzip).
 *
 * Compressed values are prefixed with "gz:" for backward compatibility detection.
 * Uncompressed values (legacy data) pass through transparently.
 */

/**
 * Compress a string using gzip and return as base64 with "gz:" prefix.
 */
export async function compress(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const input = encoder.encode(str);

  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'));
  const compressed = await new Response(stream).arrayBuffer();
  const bytes = new Uint8Array(compressed);

  // Convert to base64 for safe SQL storage
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'gz:' + btoa(binary);
}

/**
 * Decompress a "gz:"-prefixed base64 string back to original text.
 * Returns input unchanged if no prefix detected (backward compatible).
 */
export async function decompress(str: string): Promise<string> {
  if (!str.startsWith('gz:')) {
    return str; // Uncompressed legacy data — pass through
  }

  const base64 = str.slice(3); // Remove "gz:" prefix

  // Decode base64 to Uint8Array
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}
