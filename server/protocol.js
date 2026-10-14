'use strict';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isFileId = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
const isEncryptedPayload = value => typeof value === 'string'
  ? value.length > 0
  : isRecord(value) && Object.keys(value).length > 0 && Object.keys(value).length <= 10
    && Object.values(value).every(item => typeof item === 'string' && item.length > 0);

// Validate the envelope only: encrypted content remains opaque to the relay.
function validateMessage(data, maxChunks) {
  if (!isRecord(data) || typeof data.type !== 'string') return 'Invalid message format';
  for (const field of ['encryptedContent', 'encryptedMetadata', 'encryptedChunk', 'encryptedDataKey']) {
    if (data[field] !== undefined && !isEncryptedPayload(data[field])) return `Invalid ${field}`;
  }
  for (const field of ['content', 'chunk', 'previewContent', 'fileName', 'fileType', 'contentType', 'collectionId']) {
    if (data[field] !== undefined && typeof data[field] !== 'string') return `Invalid ${field}`;
  }
  if (data.fileId !== undefined && !isFileId(data.fileId)) return 'Invalid file ID';
  if (data.totalChunks !== undefined && (!Number.isSafeInteger(data.totalChunks)
    || data.totalChunks < 1 || data.totalChunks > maxChunks)) return 'Invalid total chunks';
  if (data.fileSize !== undefined && (!Number.isSafeInteger(data.fileSize) || data.fileSize < 0)) return 'Invalid file size';
  for (const field of ['collectionTotal', 'collectionIndex']) {
    if (data[field] !== undefined && (!Number.isSafeInteger(data[field]) || data[field] < 0)) return `Invalid ${field}`;
  }
  if (['file-start', 'file-key', 'file-chunk', 'file-cancel', 'chunk-ack'].includes(data.type)
    && !isFileId(data.fileId)) return 'File ID is required';
  if (data.type === 'file-key' && !isEncryptedPayload(data.encryptedDataKey)) return 'Missing data key';
  if (data.type === 'file-chunk' && !data.chunk && !data.encryptedChunk) return 'Missing chunk payload';
  if (data.type === 'clipboard' && !data.fileId && typeof data.content !== 'string'
    && !data.encryptedContent) return 'Missing clipboard content';
  if (data.type === 'clipboard' && !data.fileId && data.contentType !== undefined
    && !['text', 'rich-text'].includes(data.contentType)) return 'Files require a file transfer';
  if (data.publicKey !== undefined) {
    const key = data.publicKey;
    if (!isRecord(key) || key.kty !== 'EC' || key.crv !== 'P-256' || key.d !== undefined
      || !/^[A-Za-z0-9_-]{43}$/.test(key.x) || !/^[A-Za-z0-9_-]{43}$/.test(key.y)) {
      return 'Invalid public key';
    }
  }
  return null;
}

// Only app-local paths are valid PWA start URLs. Decoding may throw on malformed UTF-8.
function normalizeManifestPath(value) {
  if (typeof value !== 'string') return '/';
  try {
    const decoded = decodeURIComponent(value.split(/[?#]/)[0]);
    if (!/^\/[A-Za-z0-9]{6}\/?$/.test(decoded)) return '/';
    return decoded.replace(/\/$/, '');
  } catch {
    return '/';
  }
}

module.exports = { validateMessage, normalizeManifestPath };
