/**
 * Web Crypto API Utility for Secure Client-Side AES-CBC / HMAC / PBKDF2
 * Compatible with .NET / standard crypto libraries and all modern browsers.
 */

// Helper: Convert ArrayBuffer to Hex String
function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Helper: Convert Hex String to Uint8Array
function hexToBuffer(hex) {
  const cleanHex = hex.trim();
  const bytes = new Uint8Array(Math.ceil(cleanHex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Derive 256-bit AES Key from password and salt using PBKDF2 (SHA-256)
 */
async function deriveKeyPBKDF2(password, saltBuffer, iterations = 10000, usages = ['encrypt', 'decrypt']) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey', 'deriveBits']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-CBC', length: 256 },
    true, // extractable for HMAC derivation
    usages
  );
}

/**
 * Calculate HMAC-SHA256 of data using raw key bytes
 */
async function computeHmacSha256(rawKeyBytes, dataBuffer) {
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    rawKeyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const signature = await crypto.subtle.sign('HMAC', hmacKey, dataBuffer);
  return bufferToHex(signature);
}

/**
 * Decrypt API Key using passphrase and verify HMAC integrity
 * 
 * @param {object} payload - { salt, iv, ciphertext, hmac, iterations } in hex
 * @param {string} password - Tester entered passphrase
 * @returns {Promise<string>} Plaintext API Key
 */
async function decryptApiKey(payload, password) {
  if (!payload || !payload.salt || !payload.iv || !payload.ciphertext) {
    throw new Error('암호화 데이터 페이로드가 유효하지 않습니다.');
  }

  const saltBuf = hexToBuffer(payload.salt);
  const ivBuf = hexToBuffer(payload.iv);
  const cipherBuf = hexToBuffer(payload.ciphertext);
  const iterations = payload.iterations || 10000;

  try {
    // 1. Derive AES key
    const aesKey = await deriveKeyPBKDF2(password, saltBuf, iterations, ['decrypt']);
    const rawKeyBytes = await crypto.subtle.exportKey('raw', aesKey);

    // 2. Validate HMAC if present
    if (payload.hmac) {
      const calculatedHmac = await computeHmacSha256(rawKeyBytes, cipherBuf);
      if (calculatedHmac.toLowerCase() !== payload.hmac.toLowerCase()) {
        throw new Error('암호키가 일치하지 않습니다. 올바른 테스터 암호를 입력해 주세요.');
      }
    }

    // 3. Decrypt ciphertext using AES-CBC
    const decryptedBuf = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv: ivBuf },
      aesKey,
      cipherBuf
    );

    const dec = new TextDecoder();
    const plainText = dec.decode(decryptedBuf);

    if (!plainText || (!plainText.startsWith('AIzaSy') && !plainText.startsWith('AQ.') && plainText.length < 20)) {
      throw new Error('복호화된 키의 형식이 올바르지 않습니다.');
    }

    return plainText;

  } catch (err) {
    if (err.message && err.message.includes('암호키가 일치하지 않습니다')) {
      throw err;
    }
    throw new Error('암호키가 일치하지 않습니다. 전달받은 올바른 테스터 암호를 입력해 주세요.');
  }
}

/**
 * Decrypt either a single config or an array of encrypted configs
 */
async function decryptApiKeys(payloadOrArray, password) {
  if (Array.isArray(payloadOrArray)) {
    const keys = [];
    for (const item of payloadOrArray) {
      const key = await decryptApiKey(item, password);
      keys.push(key);
    }
    return keys;
  }
  const single = await decryptApiKey(payloadOrArray, password);
  return [single];
}

/**
 * Encrypt API Key using a new passphrase (for developers/admins)
 * 
 * @param {string} plaintextKey - Plain Google Gemini API Key
 * @param {string} password - New passphrase
 * @param {number} iterations - PBKDF2 iterations (default: 10000)
 * @returns {Promise<object>} { salt, iv, ciphertext, hmac, iterations } in hex
 */
async function encryptApiKey(plaintextKey, password, iterations = 10000) {
  const enc = new TextEncoder();
  const saltBuf = crypto.getRandomValues(new Uint8Array(16));
  const ivBuf = crypto.getRandomValues(new Uint8Array(16));

  const aesKey = await deriveKeyPBKDF2(password, saltBuf, iterations, ['encrypt']);
  const rawKeyBytes = await crypto.subtle.exportKey('raw', aesKey);

  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: ivBuf },
    aesKey,
    enc.encode(plaintextKey)
  );

  const hmacHex = await computeHmacSha256(rawKeyBytes, encryptedBuf);

  return {
    salt: bufferToHex(saltBuf),
    iv: bufferToHex(ivBuf),
    ciphertext: bufferToHex(encryptedBuf),
    hmac: hmacHex,
    algorithm: 'AES-CBC',
    iterations: iterations
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    bufferToHex,
    hexToBuffer,
    deriveKeyPBKDF2,
    computeHmacSha256,
    decryptApiKey,
    decryptApiKeys,
    encryptApiKey
  };
}
