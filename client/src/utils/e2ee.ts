// Key generation options
const keyGenParams = {
  name: 'ECDH',
  namedCurve: 'P-256',
};

// AES-GCM base parameters for encryption (IV is always generated fresh per call – see encryptFor)
const aesGcmParams = {
  name: 'AES-GCM',
  tagLength: 128,
};

export interface E2eeKeyPair {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

const BINARY_STRING_CHUNK_SIZE = 0x8000;

const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = '';

  for (let i = 0; i < bytes.length; i += BINARY_STRING_CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + BINARY_STRING_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
};

/**
 * Generates a new ECDH key pair for E2EE.
 */
export const generateE2eeKeyPair = async (): Promise<E2eeKeyPair> => {
  const keyPair = await window.crypto.subtle.generateKey(keyGenParams, true, ['deriveKey']);
  const publicKey = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey!);
  const privateKey = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey!);
  return { publicKey, privateKey };
};

/**
 * Derives a shared secret from a private key and a public key.
 */
const deriveSharedSecret = async (privateKey: JsonWebKey, publicKey: JsonWebKey): Promise<CryptoKey> => {
  const privKey = await window.crypto.subtle.importKey('jwk', privateKey, keyGenParams, false, ['deriveKey']);
  const pubKey = await window.crypto.subtle.importKey('jwk', publicKey, keyGenParams, false, []);
  
  return await window.crypto.subtle.deriveKey(
    { name: 'ECDH', public: pubKey },
    privKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
};

/**
 * Encrypts data for a recipient using their public key.
 */
export const encryptFor = async (data: string, privateKey: JsonWebKey, publicKey: JsonWebKey): Promise<string> => {
  const sharedSecret = await deriveSharedSecret(privateKey, publicKey);
  const encodedData = new TextEncoder().encode(data);
  
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedData = await window.crypto.subtle.encrypt(
    { ...aesGcmParams, iv },
    sharedSecret,
    encodedData
  );
  
  // Combine IV and encrypted data for transmission
  const combined = new Uint8Array(iv.length + encryptedData.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encryptedData), iv.length);
  
  return uint8ArrayToBase64(combined);
};

/**
 * Decrypts data from a sender using their public key.
 */
export const decryptFrom = async (encryptedDataB64: string, privateKey: JsonWebKey, publicKey: JsonWebKey): Promise<string | null> => {
  try {
    const sharedSecret = await deriveSharedSecret(privateKey, publicKey);
    
    const combined = base64ToUint8Array(encryptedDataB64);
    const iv = combined.slice(0, 12);
    const encryptedData = combined.slice(12);
    
    const decryptedData = await window.crypto.subtle.decrypt(
      { ...aesGcmParams, iv },
      sharedSecret,
      encryptedData
    );
    
    return new TextDecoder().decode(decryptedData);
  } catch (e) {
    console.error('Decryption failed', e);
    return null;
  }
};

// ====== Room Data Key (efficient single-encrypt for file chunks) ======

/**
 * Generates a random AES-256-GCM key for encrypting all chunks of a single file transfer.
 * The key is distributed to recipients via ECDH, so each chunk is encrypted only once.
 */
export const generateDataKey = async (): Promise<CryptoKey> => {
  return window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
};

/**
 * Exports a data key to a base64 string so it can be encrypted per-recipient via ECDH.
 */
export const exportDataKey = async (key: CryptoKey): Promise<string> => {
  const raw = await window.crypto.subtle.exportKey('raw', key);
  return uint8ArrayToBase64(new Uint8Array(raw));
};

/**
 * Imports a data key from a base64 string after ECDH decryption.
 */
export const importDataKey = async (b64: string): Promise<CryptoKey> => {
  const raw = base64ToUint8Array(b64);
  return window.crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

/**
 * Encrypts a raw binary chunk using an AES-GCM data key.
 * Returns IV (12 bytes) prepended to ciphertext as a Uint8Array.
 */
export const encryptChunk = async (data: Uint8Array, dataKey: CryptoKey): Promise<Uint8Array> => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { ...aesGcmParams, iv },
    dataKey,
    data
  );
  const combined = new Uint8Array(12 + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), 12);
  return combined;
};

/**
 * Decrypts a binary chunk that was encrypted with encryptChunk.
 */
export const decryptChunk = async (encryptedData: Uint8Array, dataKey: CryptoKey): Promise<Uint8Array> => {
  const iv = encryptedData.slice(0, 12);
  const ciphertext = encryptedData.slice(12);
  const decrypted = await window.crypto.subtle.decrypt(
    { ...aesGcmParams, iv },
    dataKey,
    ciphertext
  );
  return new Uint8Array(decrypted);
};
