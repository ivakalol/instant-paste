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
const INACTIVE_ROOM_CHECK_INTERVAL = 60 * 1000; // 1 minute
const MAX_ROOM_INACTIVITY = 60 * 60 * 1000; // 1 hour

function logRoomStatus() {
  if (rooms.size === 0) {
    log(LOG_LEVELS.INFO, 'No active rooms.');
    return;
  }
  const color = '\x1b[32m'; // Green
  const reset = '\x1b[0m';
  log(LOG_LEVELS.INFO, `${color}--- Active Rooms Status (${rooms.size} total) ---${reset}`);
  rooms.forEach((room, roomId) => {
    log(LOG_LEVELS.INFO, `${color}  Room ID: ${roomId}, Clients: ${room.clients.size}${reset}`);
  });
  log(LOG_LEVELS.INFO, `${color}-----------------------------------${reset}`);
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
  
  const room = rooms.get(roomId) || { clients: new Map(), lastActivity: Date.now() };
  if (!rooms.has(roomId)) {
    rooms.set(roomId, room);
  }

  ws.roomId = roomId;
  room.clients.set(ws.id, { ws, publicKey });
  room.lastActivity = Date.now();

  const clientsInRoom = Array.from(room.clients.values()).map(c => ({ id: c.ws.id, publicKey: c.publicKey }));
  
  broadcastToRoom(roomId, {
    type: 'room-update',
    roomId: roomId,
    clients: clientsInRoom,
    clientCount: room.clients.size
  });

  log(LOG_LEVELS.INFO, `[ROOM ${roomId}] Client ${ws.id} joined. Total clients in room: ${room.clients.size}`);
}

function handleCreate(ws, publicKey) {
  const roomId = generateRoomId();
  const room = { clients: new Map(), lastActivity: Date.now() };
  rooms.set(roomId, room);

  ws.roomId = roomId;
  room.clients.set(ws.id, { ws, publicKey });

  const clientsInRoom = Array.from(room.clients.values()).map(c => ({ id: c.ws.id, publicKey: c.publicKey }));

  ws.send(JSON.stringify({
    type: 'room-update',
    roomId: roomId,
    clients: clientsInRoom,
    clientId: ws.id,
    clientCount: room.clients.size
  }));

  ws.send(JSON.stringify({ type: 'reload' }));

  log(LOG_LEVELS.INFO, `[ROOM ${roomId}] Created by client ${ws.id}`);
  logRoomStatus();
}

function handleLeave(ws) {
  if (ws.roomId && rooms.has(ws.roomId)) {
    const room = rooms.get(ws.roomId);
    if (room.clients.has(ws.id)) {
      room.clients.delete(ws.id);
      room.lastActivity = Date.now();

      if (room.clients.size === 0) {
        rooms.delete(ws.roomId);
        log(LOG_LEVELS.INFO, `[ROOM ${ws.roomId}] Deleted (empty)`);
        logRoomStatus();
      } else {
        const clientsInRoom = Array.from(room.clients.values()).map(c => ({ id: c.ws.id, publicKey: c.publicKey }));
        broadcastToRoom(ws.roomId, {
          type: 'room-update',
          roomId: ws.roomId,
          clients: clientsInRoom,
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

  const room = rooms.get(ws.roomId);
  if (room) {
    room.lastActivity = Date.now();
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

// Check for inactive rooms
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, roomId) => {
    if (now - room.lastActivity > MAX_ROOM_INACTIVITY) {
      log(LOG_LEVELS.INFO, `[ROOM ${roomId}] Shutting down due to inactivity.`);
      room.clients.forEach(({ ws: client }) => {
        client.close();
      });
      rooms.delete(roomId);
      logRoomStatus();
    }
  });
}, INACTIVE_ROOM_CHECK_INTERVAL);

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
