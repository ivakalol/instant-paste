// Binary frame codec for WebSocket file chunk transfers.
// Format: [2B fileId-length][fileId UTF-8][4B chunkIndex][4B totalChunks][...data]

export const CHUNK_SIZE = 1024 * 1024; // 1 MB
export const BUFFER_HIGH_WATER = 8 * 1024 * 1024; // 8 MB

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const toBlobArrayBuffer = (data: Uint8Array): ArrayBuffer => {
  if (
    data.buffer instanceof ArrayBuffer
    && data.byteOffset === 0
    && data.byteLength === data.buffer.byteLength
  ) {
    return data.buffer;
  }
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return buffer;
};

export const encodeBinaryFrame = (
  fileId: string,
  chunkIndex: number,
  totalChunks: number,
  data: Uint8Array,
): ArrayBuffer => {
  const idBytes = textEncoder.encode(fileId);
  const headerLen = 2 + idBytes.length + 4 + 4;
  const buf = new ArrayBuffer(headerLen + data.byteLength);
  const view = new DataView(buf);
  let o = 0;
  view.setUint16(o, idBytes.length); o += 2;
  new Uint8Array(buf, o, idBytes.length).set(idBytes); o += idBytes.length;
  view.setUint32(o, chunkIndex); o += 4;
  view.setUint32(o, totalChunks); o += 4;
  new Uint8Array(buf, o).set(data);
  return buf;
};

export const decodeBinaryFrame = (
  buf: ArrayBuffer,
): { fileId: string; chunkIndex: number; totalChunks: number; data: Uint8Array } => {
  const view = new DataView(buf);
  let o = 0;
  const idLen = view.getUint16(o); o += 2;
  const fileId = textDecoder.decode(new Uint8Array(buf, o, idLen)); o += idLen;
  const chunkIndex = view.getUint32(o); o += 4;
  const totalChunks = view.getUint32(o); o += 4;
  const data = new Uint8Array(buf, o, buf.byteLength - o);
  return { fileId, chunkIndex, totalChunks, data };
};
