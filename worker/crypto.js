const enc = new TextEncoder();

export function randomHex(bytesLen = 16) {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualStrings(a, b) {
  const ba = enc.encode(String(a || ''));
  const bb = enc.encode(String(b || ''));
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) {
    diff |= ba[i] ^ bb[i];
  }
  return diff === 0;
}

async function hmacSha256Raw(secret, rawBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, rawBytes);
  return new Uint8Array(sig);
}

export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64Str) {
  const clean = String(base64Str || '').replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password, saltHex = randomHex(16)) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(password)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(saltHex),
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );
  return {
    hash: bytesToHex(new Uint8Array(bits)),
    salt: saltHex,
  };
}

export async function verifyPassword(password, expectedHash, saltHex) {
  if (!password || !expectedHash || !saltHex) return false;
  const { hash } = await hashPassword(password, saltHex);
  return timingSafeEqualStrings(hash, expectedHash);
}

export async function verifyLineSignatureWeb(rawArrayBuffer, signatureHeader, channelSecret) {
  if (!channelSecret || !signatureHeader || !rawArrayBuffer) return false;
  const sigBytes = await hmacSha256Raw(channelSecret, rawArrayBuffer);
  const expectedBase64 = bytesToBase64(sigBytes);
  return timingSafeEqualStrings(expectedBase64, String(signatureHeader).trim());
}

export async function verifyFacebookSignatureWeb(rawArrayBuffer, signatureHeader, appSecret) {
  if (!appSecret || !signatureHeader || !rawArrayBuffer) return false;
  const header = String(signatureHeader).trim();
  if (!header.startsWith('sha256=')) return false;
  const receivedHex = header.slice('sha256='.length);
  const sigBytes = await hmacSha256Raw(appSecret, rawArrayBuffer);
  const expectedHex = bytesToHex(sigBytes);
  return timingSafeEqualStrings(expectedHex, receivedHex);
}
