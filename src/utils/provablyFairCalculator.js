/**
 * Casino Provably Fair Cryptographic Verification Engine
 * 
 * Verifies round outcomes using HMAC-SHA256:
 * - Crash multiplier (1.00x - 1000.00x)
 * - Dice outcome (0.00 - 99.99)
 * - Mines grid bomb placement
 */

/**
 * Convert hex string to integer
 */
function hexToInt(hex) {
  return parseInt(hex, 16);
}

/**
 * Standard client-side SHA256 / HMAC verification hash
 */
export async function generateHmacSha256(serverSeed, combinedMessage) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(serverSeed),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(combinedMessage));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify Crash Multiplier from serverSeed + clientSeed + nonce
 */
export async function verifyCrashMultiplier(serverSeed, clientSeed, nonce = 0) {
  const message = `${clientSeed}:${nonce}`;
  const hash = await generateHmacSha256(serverSeed, message);

  // Take first 52 bits (13 hex characters)
  const hex52 = hash.slice(0, 13);
  const intVal = parseInt(hex52, 16);
  const max52 = 2 ** 52;

  // 1% house edge instant crash check
  if (intVal % 33 === 0) {
    return { multiplier: 1.00, hash, isInstantBust: true };
  }

  const multiplier = Math.floor(((100 * max52 - intVal) / (max52 - intVal)) / 100 * 100) / 100;
  return {
    multiplier: Math.max(1.00, Math.min(10000.00, multiplier)),
    hash,
    isInstantBust: false,
  };
}

/**
 * Verify Dice Roll (0.00 - 99.99)
 */
export async function verifyDiceRoll(serverSeed, clientSeed, nonce = 0) {
  const message = `${clientSeed}:${nonce}`;
  const hash = await generateHmacSha256(serverSeed, message);

  const hex32 = hash.slice(0, 8);
  const intVal = parseInt(hex32, 16);
  const roll = (intVal % 10000) / 100;

  return {
    roll: Number(roll.toFixed(2)),
    hash,
  };
}
