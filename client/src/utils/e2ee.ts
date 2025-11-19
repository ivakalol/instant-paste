const KEY_STORAGE_NAME = 'e2ee-key-pair';

// Key generation options
const keyGenParams = {
  name: 'ECDH',
  namedCurve: 'P-256',
};

// AES-GCM parameters for encryption
const aesGcmParams = {
  name: 'AES-GCM',
  iv: new Uint8Array(12), // Initialization vector
  tagLength: 128,
};

export interface E2eeKeyPair {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

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
 * Stores the E2EE key pair in localStorage.
 */
export const storeKeyPair = (keyPair: E2eeKeyPair) => {
  localStorage.setItem(KEY_STORAGE_NAME, JSON.stringify(keyPair));
};

/**
 * Retrieves the E2EE key pair from localStorage.
 */
export const getKeyPair = (): E2eeKeyPair | null => {
  const stored = localStorage.getItem(KEY_STORAGE_NAME);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse stored key pair', e);
      return null;
    }
  }
  return null;
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
  
  return btoa(String.fromCharCode.apply(null, Array.from(combined)));
};

/**
 * Decrypts data from a sender using their public key.
 */
export const decryptFrom = async (encryptedDataB64: string, privateKey: JsonWebKey, publicKey: JsonWebKey): Promise<string | null> => {
  try {
    const sharedSecret = await deriveSharedSecret(privateKey, publicKey);
    
    const combined = new Uint8Array(Array.from(atob(encryptedDataB64), c => c.charCodeAt(0)));
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
