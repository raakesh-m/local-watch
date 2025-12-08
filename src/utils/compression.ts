import pako from 'pako';

/**
 * Compress and encode signal data for easier sharing
 * Reduces ~500 char signals to ~150-200 chars
 */
export function compressSignal(signal: string): string {
  try {
    const compressed = pako.deflate(signal);
    // Convert to base64 using a URL-safe alphabet
    const base64 = btoa(String.fromCharCode(...compressed))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return base64;
  } catch (error) {
    console.error('Compression error:', error);
    return signal; // Return original if compression fails
  }
}

/**
 * Decompress signal data from compressed format
 */
export function decompressSignal(compressed: string): string {
  try {
    // Restore base64 padding and characters
    let base64 = compressed.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const decompressed = pako.inflate(bytes, { to: 'string' });
    return decompressed;
  } catch (error) {
    console.error('Decompression error:', error);
    // Maybe it's not compressed, return as-is
    return compressed;
  }
}

/**
 * Check if a string is compressed signal data
 */
export function isCompressedSignal(data: string): boolean {
  // Compressed data won't be valid JSON
  try {
    JSON.parse(data);
    return false; // It's valid JSON, so not compressed
  } catch {
    return true; // Not JSON, likely compressed
  }
}

/**
 * Smart decompress - handles both compressed and uncompressed signals
 */
export function smartDecompress(data: string): string {
  if (isCompressedSignal(data)) {
    return decompressSignal(data);
  }
  return data;
}
