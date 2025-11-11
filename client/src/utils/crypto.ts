import CryptoJS from 'crypto-js';

export const encryptData = (data: string, password: string): string => {
  try {
    return CryptoJS.AES.encrypt(data, password).toString();
  } catch (error) {
    console.error('Encryption error:', error);
    return data;
  }
};

export const decryptData = (encryptedData: string, password: string): string | null => {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, password);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) {
      console.error('Decryption failed: Incorrect password or corrupted data.');
      return null;
    }
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
};
