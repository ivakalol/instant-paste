// E2EE encryption/decryption wrappers for WebSocket message payloads.

import { encryptFor, decryptFrom } from '../utils/e2ee';
import { WebSocketMessage } from '../types';

export interface EncryptionContext {
  isE2eeEnabled: boolean;
  keyPair: { publicKey: JsonWebKey; privateKey: JsonWebKey } | null;
  roomClients: Record<string, { id: string; publicKey?: JsonWebKey }>;
  clientId: string | null;
}

export type EncryptedPayload = string | Record<string, string>;

export const encryptForRecipients = async (
  plainText: string,
  ctx: EncryptionContext,
): Promise<Record<string, string> | null> => {
  if (!ctx.isE2eeEnabled || !ctx.keyPair || !ctx.clientId) return null;

  const recipients = Object.values(ctx.roomClients).filter(c => c.id !== ctx.clientId);
  if (recipients.length === 0 || recipients.some(c => !c.publicKey)) return null;

  const result: Record<string, string> = {};
  await Promise.all(
    recipients.map(async (recipient) => {
      result[recipient.id] = await encryptFor(
        plainText, ctx.keyPair!.privateKey, recipient.publicKey!,
      );
    })
  );
  return result;
};

export const getEncryptedValueForCurrentClient = (
  payload: EncryptedPayload | undefined,
  clientId: string | null,
): string | null => {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;
  if (!clientId) return null;
  return payload[clientId] || null;
};

export const decryptFromSender = async (
  payload: EncryptedPayload | undefined,
  senderId: string | undefined,
  ctx: EncryptionContext,
): Promise<string | null> => {
  if (!ctx.isE2eeEnabled || !ctx.keyPair || !senderId) return null;

  const encrypted = getEncryptedValueForCurrentClient(payload, ctx.clientId);
  if (!encrypted) return null;

  const sender = ctx.roomClients[senderId];
  if (!sender?.publicKey) return null;

  return decryptFrom(encrypted, ctx.keyPair.privateKey, sender.publicKey);
};

export const decryptMetadata = async (
  message: WebSocketMessage,
  ctx: EncryptionContext,
): Promise<WebSocketMessage> => {
  if (!message.fileId || !message.encryptedMetadata) return message;

  const decrypted = await decryptFromSender(message.encryptedMetadata, message.senderId, ctx);
  if (!decrypted) return message;

  try {
    const parsed = JSON.parse(decrypted);
    return {
      ...message,
      fileName: parsed.fileName,
      fileSize: parsed.fileSize,
      fileType: parsed.fileType,
      contentType: parsed.contentType,
      previewContent: parsed.previewContent,
    };
  } catch {
    console.error('Failed to parse decrypted metadata');
    return message;
  }
};
