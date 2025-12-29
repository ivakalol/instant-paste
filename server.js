const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  PORT: process.env. PORT || 3000,
  
  // Room settings
  MAX_ROOM_SIZE: 10,
  MAX_ROOM_INACTIVITY: 60 * 60 * 1000, // 1 hour
  INACTIVE_ROOM_CHECK_INTERVAL: 60 * 1000, // 1 minute
  ROOM_STATUS_INTERVAL: 5 * 60 * 1000, // 5 minutes
  
  // Rate limiting
  MESSAGE_RATE_LIMIT: 100, // messages per second
  RATE_LIMIT_WINDOW: 1000, // 1 second
  
  // File transfer limits
  MAX_FILE_SIZE: 1024 * 1024 * 1024, // 1GB
  MAX_FILENAME_LENGTH: 255,
  
  // WebSocket settings
  WS_MAX_PAYLOAD:  2 * 1024 * 1024, // 2MB
  HEARTBEAT_INTERVAL:  30000, // 30 seconds
};

// =============================================================================
// LOGGING
// =============================================================================

const LOG_LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR:  'ERROR',
  DEBUG: 'DEBUG',
};

function log(level, message, ...args) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`, ...args);
}

// =============================================================================
// METRICS
// =============================================================================

const metrics = {
  totalConnections: 0,
  activeConnections: 0,
  messagesRelayed: 0,
  filesTransferred: 0,
  roomsCreated: 0,
  errors: 0,
  rateLimitHits: 0,
  startTime: Date.now(),
};

// =============================================================================
// ERROR CODES
// =============================================================================

const ERROR_CODES = {
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_ID_REQUIRED: 'ROOM_ID_REQUIRED',
  INVALID_ROOM_ID: 'INVALID_ROOM_ID',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_FILE_ID: 'INVALID_FILE_ID',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILENAME:  'INVALID_FILENAME',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
};

// =============================================================================
// SERVER SETUP
// =============================================================================

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, maxPayload: CONFIG. WS_MAX_PAYLOAD });

const rooms = new Map();
const messageCounters = new Map();

app.use(cors());
app.use(express.json({ limit: '1gb' }));
app.use(express.static(path.join(__dirname, 'client/build')));

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function sendError(ws, code, message) {
  if (ws. readyState === WebSocket.OPEN) {
    ws. send(JSON.stringify({ type: 'error', code, message }));
  }
  metrics.errors++;
}

function sendMessage(ws, data) {
  if (ws.readyState === WebSocket. OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function generateRoomId() {
  let roomId;
  do {
    const uuid = crypto.randomUUID();
    roomId = uuid.replace(/-/g, '').substring(0, 6).toUpperCase();
  } while (rooms.has(roomId));
  return roomId;
}

function checkRateLimit(ws) {
  const now = Date.now();
  let counter = messageCounters. get(ws.id);

  if (! counter || now > counter. resetTime) {
    counter = { count:  0, resetTime: now + CONFIG.RATE_LIMIT_WINDOW };
  }

  counter.count++;
  messageCounters.set(ws.id, counter);

  if (counter.count > CONFIG.MESSAGE_RATE_LIMIT) {
    log(LOG_LEVELS. WARN, `[WS] Rate limit exceeded for ${ws.id}`);
    metrics.rateLimitHits++;
    return false;
  }
  return true;
}

function cleanupClient(wsId) {
  messageCounters.delete(wsId);
}

function logRoomStatus() {
  if (rooms.size === 0) {
    log(LOG_LEVELS.INFO, 'No active rooms.');
    return;
  }
  const color = '\x1b[32m'; // Green
  const reset = '\x1b[0m';
  log(LOG_LEVELS.INFO, `${color}--- Active Rooms Status (${rooms.size} total) ---${reset}`);
  rooms.forEach((room, roomId) => {
    const fileTransfers = room.activeTransfers ?  room.activeTransfers. size : 0;
    log(LOG_LEVELS.INFO, `${color}  Room ID: ${roomId}, Clients: ${room.clients.size}, Active File Transfers: ${fileTransfers}${reset}`);
  });
  log(LOG_LEVELS.INFO, `${color}-----------------------------------${reset}`);
}

function broadcastToRoom(roomId, data, excludeWs = null) {
  const room = rooms.get(roomId);
  if (!room) return;

  const message = JSON.stringify(data);

  room.clients.forEach(({ ws: client }) => {
    if (client !== excludeWs && client.readyState === WebSocket. OPEN) {
      client.send(message);
    }
  });

  metrics.messagesRelayed++;
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

function validateRoomId(roomId) {
  if (!roomId) {
    return { valid: false, code: ERROR_CODES.ROOM_ID_REQUIRED, message: 'Room ID is required' };
  }
  if (typeof roomId !== 'string' || !/^[A-Za-z0-9]{6}$/.test(roomId)) {
    return { valid: false, code: ERROR_CODES.INVALID_ROOM_ID, message: 'Invalid room ID format' };
  }
  return { valid: true };
}

function validateFileStart(data) {
  if (!data. fileId || typeof data.fileId !== 'string') {
    return { valid:  false, code: ERROR_CODES. INVALID_FILE_ID, message: 'Invalid file ID' };
  }
  if (data.fileSize && data.fileSize > CONFIG.MAX_FILE_SIZE) {
    return { valid:  false, code: ERROR_CODES.FILE_TOO_LARGE, message: `File exceeds maximum size of ${CONFIG.MAX_FILE_SIZE} bytes` };
  }
  if (data. fileName && (typeof data.fileName !== 'string' || data.fileName.length > CONFIG.MAX_FILENAME_LENGTH)) {
    return { valid: false, code: ERROR_CODES.INVALID_FILENAME, message: 'Invalid filename' };
  }
  return { valid: true };
}

function validateFileChunk(data) {
  if (! data.fileId || typeof data.fileId !== 'string') {
    return { valid: false, code: ERROR_CODES.INVALID_FILE_ID, message:  'Invalid file ID' };
  }
  if (typeof data.chunkIndex !== 'number' || typeof data.totalChunks !== 'number') {
    return { valid: false, code: ERROR_CODES.INVALID_MESSAGE, message: 'Invalid chunk data' };
  }
  if (data.chunkIndex < 0 || data.chunkIndex >= data.totalChunks) {
    return { valid:  false, code: ERROR_CODES. INVALID_MESSAGE, message: 'Chunk index out of range' };
  }
  return { valid: true };
}

// =============================================================================
// MESSAGE HANDLERS
// =============================================================================

function handleJoin(ws, roomId, publicKey) {
  const validation = validateRoomId(roomId);
  if (!validation. valid) {
    sendError(ws, validation.code, validation.message);
    return;
  }

  roomId = roomId.toUpperCase();

  // Leave current room first if already in one
  if (ws.roomId) {
    handleLeave(ws);
  }

  // Get existing room or create a new one (restored original behavior)
  let room = rooms.get(roomId);
  if (!room) {
    room = { clients: new Map(), lastActivity: Date.now(), activeTransfers: new Map() };
    rooms.set(roomId, room);
    metrics.roomsCreated++;
    log(LOG_LEVELS. INFO, `[ROOM ${roomId}] Created by client ${ws.id} via join`);
  }

  // Check room size limit
  if (room.clients.size >= CONFIG.MAX_ROOM_SIZE) {
    sendError(ws, ERROR_CODES. ROOM_FULL, 'Room is full');
    return;
  }

  ws.roomId = roomId;
  room.clients.set(ws.id, { ws, publicKey });
  room.lastActivity = Date.now();

  const clientsInRoom = Array. from(room.clients.values()).map(c => ({ id: c.ws.id, publicKey: c.publicKey }));

  broadcastToRoom(roomId, {
    type: 'room-update',
    roomId:  roomId,
    clients: clientsInRoom,
    clientCount: room.clients.size
  });

  log(LOG_LEVELS.INFO, `[ROOM ${roomId}] Client ${ws.id} joined.  Total clients in room: ${room. clients.size}`);
}

function handleCreate(ws, publicKey) {
  // Leave current room first if already in one
  if (ws.roomId) {
    handleLeave(ws);
  }

  const roomId = generateRoomId();
  const room = { clients: new Map(), lastActivity: Date.now(), activeTransfers: new Map() };
  rooms.set(roomId, room);

  ws.roomId = roomId;
  room.clients.set(ws.id, { ws, publicKey });

  const clientsInRoom = Array.from(room.clients.values()).map(c => ({ id: c.ws.id, publicKey: c.publicKey }));

  sendMessage(ws, {
    type: 'room-update',
    roomId:  roomId,
    clients: clientsInRoom,
    clientId: ws.id,
    clientCount: room.clients.size
  });

  sendMessage(ws, { type: 'reload' });

  metrics.roomsCreated++;
  log(LOG_LEVELS. INFO, `[ROOM ${roomId}] Created by client ${ws.id}`);
  logRoomStatus();
}

function handleLeave(ws) {
  if (! ws.roomId || !rooms.has(ws.roomId)) {
    return;
  }

  const room = rooms. get(ws.roomId);
  const roomId = ws.roomId;

  if (! room.clients.has(ws.id)) {
    return;
  }

  room.clients.delete(ws.id);
  room.lastActivity = Date.now();

  // Cancel any active file transfers from the disconnected client
  if (room.activeTransfers. has(ws.id)) {
    const fileIds = room.activeTransfers. get(ws.id);
    fileIds.forEach(fileId => {
      log(LOG_LEVELS. WARN, `[ROOM ${roomId}] Cancelling file transfer ${fileId} from disconnected client ${ws.id}`);
      broadcastToRoom(roomId, { type: 'file-cancel', fileId:  fileId, senderId: ws.id });
    });
    room.activeTransfers.delete(ws.id);
  }

  if (room.clients. size === 0) {
    rooms. delete(roomId);
    log(LOG_LEVELS.INFO, `[ROOM ${roomId}] Deleted (empty)`);
    logRoomStatus();
  } else {
    const clientsInRoom = Array.from(room.clients.values()).map(c => ({ id: c.ws.id, publicKey: c.publicKey }));
    broadcastToRoom(roomId, {
      type: 'room-update',
      roomId: roomId,
      clients:  clientsInRoom,
      clientCount:  room.clients.size
    });
    log(LOG_LEVELS.INFO, `[ROOM ${roomId}] Client ${ws.id} left. Total clients in room: ${room. clients.size}`);
  }

  ws.roomId = null;
}

function handleClipboard(ws, data) {
  if (!ws.roomId) {
    sendError(ws, ERROR_CODES.NOT_IN_ROOM, 'Not in a room');
    return;
  }

  const room = rooms.get(ws.roomId);
  if (!room) return;
  room.lastActivity = Date.now();

  const message = {
    ... data,
    senderId: ws.id,
    timestamp: Date.now()
  };

  // If it's a file transfer, track it. 
  if (data.fileId) {
    if (!room.activeTransfers.has(ws.id)) {
      room.activeTransfers.set(ws.id, new Set());
    }
    room.activeTransfers.get(ws.id).add(data.fileId);
    log(LOG_LEVELS.INFO, `[ROOM ${ws. roomId}] Started file transfer ${data. fileId} from ${ws.id}`);
  }

  log(LOG_LEVELS.INFO, `[ROOM ${ws. roomId}] Relaying '${data.type}' from ${ws.id}`);
  broadcastToRoom(ws. roomId, message, ws);
}

function handleFileChunk(ws, data) {
  if (!ws.roomId) {
    sendError(ws, ERROR_CODES.NOT_IN_ROOM, 'Not in a room');
    return;
  }

  const validation = validateFileChunk(data);
  if (!validation. valid) {
    sendError(ws, validation.code, validation.message);
    return;
  }

  const room = rooms.get(ws.roomId);
  if (!room) return;
  room.lastActivity = Date.now();

  const message = {
    ...data,
    senderId: ws.id,
  };

  // Clean up transfer tracking when the last chunk is sent
  if (data.chunkIndex === data. totalChunks - 1) {
    if (room. activeTransfers.has(ws.id)) {
      room.activeTransfers. get(ws.id).delete(data.fileId);
      if (room.activeTransfers.get(ws.id).size === 0) {
        room.activeTransfers.delete(ws.id);
      }
    }
    metrics.filesTransferred++;
    log(LOG_LEVELS.INFO, `[ROOM ${ws.roomId}] Finished file transfer ${data.fileId} from ${ws.id}`);
  }

  broadcastToRoom(ws.roomId, message, ws);
}

function handleFileStart(ws, data) {
  if (! ws.roomId) {
    sendError(ws, ERROR_CODES.NOT_IN_ROOM, 'Not in a room');
    return;
  }

  const validation = validateFileStart(data);
  if (!validation.valid) {
    sendError(ws, validation.code, validation.message);
    return;
  }

  const room = rooms.get(ws.roomId);
  if (!room) return;
  room.lastActivity = Date.now();

  // Track the file transfer
  if (!room.activeTransfers.has(ws.id)) {
    room.activeTransfers.set(ws.id, new Set());
  }
  room.activeTransfers.get(ws.id).add(data.fileId);

  const message = {
    ...data,
    senderId: ws. id,
    timestamp: Date.now()
  };

  log(LOG_LEVELS.INFO, `[ROOM ${ws.roomId}] Relaying '${data.type}' for file ${data.fileId} from ${ws.id}`);
  broadcastToRoom(ws.roomId, message, ws);
}

// =============================================================================
// WEBSOCKET CONNECTION HANDLER
// =============================================================================

wss.on('connection', (ws) => {
  ws.id = crypto.randomUUID();
  ws.isAlive = true;

  metrics.totalConnections++;
  metrics.activeConnections++;

  log(LOG_LEVELS.INFO, `[WS] Client connected: ${ws.id}`);

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (message) => {
    try {
      // Check rate limit
      if (!checkRateLimit(ws)) {
        sendError(ws, ERROR_CODES. RATE_LIMITED, 'Too many messages.  Please slow down.');
        return;
      }

      const data = JSON.parse(message. toString());

      if (! data.type || typeof data.type !== 'string') {
        sendError(ws, ERROR_CODES.INVALID_MESSAGE, 'Invalid message format');
        return;
      }

      switch (data.type) {
        case 'join': 
          handleJoin(ws, data.roomId, data.publicKey);
          break;
        case 'create': 
          handleCreate(ws, data.publicKey);
          break;
        case 'leave':
          handleLeave(ws);
          break;
        case 'clipboard':
          handleClipboard(ws, data);
          break;
        case 'file-chunk':
          handleFileChunk(ws, data);
          break;
        case 'file-start':
          handleFileStart(ws, data);
          break;
        default:
          log(LOG_LEVELS.WARN, `[ROOM ${ws.roomId}] Unknown message type from ${ws.id}: `, data.type);
          sendError(ws, ERROR_CODES. INVALID_MESSAGE, `Unknown message type: ${data.type}`);
      }
    } catch (error) {
      log(LOG_LEVELS. ERROR, 'Error handling message:', error);
      sendError(ws, ERROR_CODES.INVALID_MESSAGE, 'Failed to parse message');
    }
  });

  ws.on('close', () => {
    log(LOG_LEVELS.INFO, `[WS] Client disconnected: ${ws. id}`);
    metrics.activeConnections--;
    cleanupClient(ws. id);
    handleLeave(ws);
  });

  ws.on('error', (error) => {
    log(LOG_LEVELS. ERROR, `[WS] Error for client ${ws.id}:`, error);
    metrics.errors++;
  });
});

// =============================================================================
// HEARTBEAT INTERVAL
// =============================================================================

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws. isAlive === false) {
      log(LOG_LEVELS.WARN, `[WS] Terminating unresponsive client ${ws.id}`);
      metrics.activeConnections--;
      cleanupClient(ws.id);
      handleLeave(ws);
      ws.terminate();
    } else {
      ws.isAlive = false;
      ws.ping();
    }
  });
}, CONFIG.HEARTBEAT_INTERVAL);

// =============================================================================
// INACTIVE ROOM CLEANUP
// =============================================================================

const inactiveRoomCheckInterval = setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, roomId) => {
    if (now - room.lastActivity > CONFIG.MAX_ROOM_INACTIVITY) {
      log(LOG_LEVELS.INFO, `[ROOM ${roomId}] Shutting down due to inactivity. `);
      room.clients.forEach(({ ws: client }) => {
        sendMessage(client, { type: 'room-closed', reason: 'inactivity' });
        client.close();
      });
      rooms.delete(roomId);
      logRoomStatus();
    }
  });
}, CONFIG. INACTIVE_ROOM_CHECK_INTERVAL);

// =============================================================================
// ROOM STATUS LOGGING
// =============================================================================

const roomStatusInterval = setInterval(logRoomStatus, CONFIG.ROOM_STATUS_INTERVAL);

// =============================================================================
// HTTP ROUTES
// =============================================================================

// Health check endpoint with metrics
app.get('/health', (req, res) => {
  const uptime = Date.now() - metrics.startTime;
  res.json({
    status: 'ok',
    uptime: uptime,
    uptimeHuman: `${Math.floor(uptime / 1000 / 60 / 60)}h ${Math.floor((uptime / 1000 / 60) % 60)}m`,
    rooms: rooms.size,
    connections: wss.clients.size,
    metrics:  {
      totalConnections: metrics.totalConnections,
      activeConnections: metrics.activeConnections,
      messagesRelayed: metrics.messagesRelayed,
      filesTransferred:  metrics.filesTransferred,
      roomsCreated: metrics. roomsCreated,
      errors: metrics.errors,
      rateLimitHits: metrics.rateLimitHits,
    }
  });
});

// Catch-all for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// =============================================================================
// SERVER LIFECYCLE
// =============================================================================

wss.on('close', () => {
  clearInterval(heartbeatInterval);
  clearInterval(inactiveRoomCheckInterval);
  clearInterval(roomStatusInterval);
});

server.listen(CONFIG. PORT, () => {
  log(LOG_LEVELS.INFO, `Server running on port ${CONFIG. PORT}`);
  log(LOG_LEVELS.INFO, `Access at: http://localhost:${CONFIG.PORT}`);
  log(LOG_LEVELS.INFO, `Health check at: http://localhost:${CONFIG. PORT}/health`);
});

process.on('SIGTERM', () => {
  log(LOG_LEVELS.INFO, 'SIGTERM received, closing server.. .');
  
  // Notify all clients
  wss.clients.forEach((ws) => {
    sendMessage(ws, { type: 'server-shutdown' });
  });
  
  server.close(() => {
    log(LOG_LEVELS.INFO, 'Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log(LOG_LEVELS. INFO, 'SIGINT received, closing server...');
  
  wss.clients.forEach((ws) => {
    sendMessage(ws, { type:  'server-shutdown' });
  });
  
  server.close(() => {
    log(LOG_LEVELS.INFO, 'Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log(LOG_LEVELS.ERROR, 'Uncaught exception:', error);
  metrics.errors++;
});

process.on('unhandledRejection', (reason, promise) => {
  log(LOG_LEVELS.ERROR, 'Unhandled rejection at:', promise, 'reason:', reason);
  metrics.errors++;
});