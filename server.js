const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const LOG_LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

function log(level, message, ...args) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`, ...args);
}

const ROOM_STATUS_INTERVAL = 5 * 60 * 1000; // 5 minutes

function logRoomStatus() {
  if (rooms.size === 0) {
    log(LOG_LEVELS.INFO, 'No active rooms.');
    return;
  }
  log(LOG_LEVELS.INFO, `--- Active Rooms Status (${rooms.size} total) ---`);
  rooms.forEach((room, roomId) => {
    log(LOG_LEVELS.INFO, `  Room ID: ${roomId}, Clients: ${room.clients.size}`);
  });
  log(LOG_LEVELS.INFO, '-----------------------------------');
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

const rooms = new Map();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'client/build')));

function generateRoomId() {
  let roomId;
  do {
    const uuid = crypto.randomUUID();
    roomId = uuid.replace(/-/g, '').substring(0, 6).toUpperCase();
  } while (rooms.has(roomId));
  return roomId;
}

wss.on('connection', (ws) => {
  ws.id = crypto.randomUUID();
  log(LOG_LEVELS.INFO, `[WS] Client connected: ${ws.id}`);
  
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
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
        default:
          log(LOG_LEVELS.WARN, 'Unknown message type:', data.type);
      }
    } catch (error) {
      log(LOG_LEVELS.ERROR, 'Error handling message:', error);
    }
  });

  ws.on('close', () => {
    log(LOG_LEVELS.INFO, `[WS] Client disconnected: ${ws.id}`);
    handleLeave(ws);
  });

  ws.on('error', (error) => {
    log(LOG_LEVELS.ERROR, 'WebSocket error:', error);
  });
});

function handleJoin(ws, roomId, publicKey) {
  if (!roomId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room ID is required' }));
    return;
  }

  if (typeof roomId !== 'string' || !/^[A-Za-z0-9]{6}$/.test(roomId)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid room ID format.' }));
    return;
  }
  roomId = roomId.toUpperCase();
  
  const room = rooms.get(roomId) || { clients: new Map() };
  if (!rooms.has(roomId)) {
    rooms.set(roomId, room);
  }

  ws.roomId = roomId;
  room.clients.set(ws.id, { ws, publicKey });

  const clientsInRoom = Array.from(room.clients.values()).map(c => ({ id: c.ws.id, publicKey: c.publicKey }));
  
  ws.send(JSON.stringify({ 
    type: 'joined', 
    roomId: roomId,
    clients: clientsInRoom,
    clientId: ws.id
  }));

  broadcastToRoom(roomId, { 
    type: 'client-joined',
    client: { id: ws.id, publicKey },
    clientCount: room.clients.size
  }, ws);

  log(LOG_LEVELS.INFO, `[ROOM ${roomId}] Client ${ws.id} joined. Total clients in room: ${room.clients.size}`);
}

function handleCreate(ws, publicKey) {
  const roomId = generateRoomId();
  const room = { clients: new Map() };
  rooms.set(roomId, room);

  ws.roomId = roomId;
  room.clients.set(ws.id, { ws, publicKey });

  ws.send(JSON.stringify({
    type: 'created',
    roomId: roomId,
    clients: [{ id: ws.id, publicKey }],
    clientId: ws.id
  }));

  log(LOG_LEVELS.INFO, `[ROOM ${roomId}] Created by client ${ws.id}`);
  logRoomStatus();
}

function handleLeave(ws) {
  if (ws.roomId && rooms.has(ws.roomId)) {
    const room = rooms.get(ws.roomId);
    if (room.clients.has(ws.id)) {
      room.clients.delete(ws.id);

      if (room.clients.size === 0) {
        rooms.delete(ws.roomId);
        log(LOG_LEVELS.INFO, `[ROOM ${ws.roomId}] Deleted (empty)`);
        logRoomStatus();
      } else {
        broadcastToRoom(ws.roomId, {
          type: 'client-left',
          clientId: ws.id,
          clientCount: room.clients.size
        });
        log(LOG_LEVELS.INFO, `[ROOM ${ws.roomId}] Client ${ws.id} left. Total clients in room: ${room.clients.size}`);
      }
      ws.roomId = null;
    }
  }
}

function handleClipboard(ws, data) {
  if (!ws.roomId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not in a room' }));
    return;
  }

  const message = {
    type: 'clipboard',
    contentType: data.contentType,
    senderId: ws.id,
    timestamp: Date.now()
  };

  if (data.encryptedContent) {
    message.encryptedContent = data.encryptedContent;
    log(LOG_LEVELS.INFO, `[ROOM ${ws.roomId}] Encrypted clipboard data relayed from ${ws.id}`);
  } else {
    message.content = data.content;
    log(LOG_LEVELS.INFO, `[ROOM ${ws.roomId}] Unencrypted clipboard data relayed from ${ws.id}`);
  }

  broadcastToRoom(ws.roomId, message, ws);
}

function broadcastToRoom(roomId, data, excludeWs = null) {
  const room = rooms.get(roomId);
  if (!room) return;

  const message = JSON.stringify(data);
  
  room.clients.forEach(({ ws: client }) => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      handleLeave(ws);
      ws.terminate();
    } else {
      ws.isAlive = false;
      ws.ping();
    }
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

server.listen(PORT, () => {
  log(LOG_LEVELS.INFO, `Server running on port ${PORT}`);
  log(LOG_LEVELS.INFO, `Access at: http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
  log(LOG_LEVELS.INFO, 'SIGTERM received, closing server...');
  server.close(() => {
    log(LOG_LEVELS.INFO, 'Server closed');
    process.exit(0);
  });
});

// Start periodic room status logging
setInterval(logRoomStatus, ROOM_STATUS_INTERVAL);
