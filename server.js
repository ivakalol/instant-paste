const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

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
  console.log(`New client connected: ${ws.id}`);
  
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
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected: ${ws.id}`);
    handleLeave(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function handleJoin(ws, roomId, publicKey) {
  if (!roomId || !publicKey) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room ID and public key are required' }));
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
    clients: clientsInRoom
  }));

  broadcastToRoom(roomId, { 
    type: 'client-joined',
    client: { id: ws.id, publicKey }
  }, ws);

  console.log(`Client ${ws.id} joined room ${roomId} (${room.clients.size} clients)`);
}

function handleCreate(ws, publicKey) {
  if (!publicKey) {
    ws.send(JSON.stringify({ type: 'error', message: 'Public key is required' }));
    return;
  }
  const roomId = generateRoomId();
  const room = { clients: new Map() };
  rooms.set(roomId, room);

  ws.roomId = roomId;
  room.clients.set(ws.id, { ws, publicKey });

  ws.send(JSON.stringify({ 
    type: 'created', 
    roomId: roomId,
    clients: [{ id: ws.id, publicKey }]
  }));

  console.log(`Room ${roomId} created by ${ws.id}`);
}

function handleLeave(ws) {
  if (ws.roomId && rooms.has(ws.roomId)) {
    const room = rooms.get(ws.roomId);
    room.clients.delete(ws.id);

    if (room.clients.size === 0) {
      rooms.delete(ws.roomId);
      console.log(`Room ${ws.roomId} deleted (empty)`);
    } else {
      broadcastToRoom(ws.roomId, { 
        type: 'client-left',
        clientId: ws.id
      });
      console.log(`Client ${ws.id} left room ${ws.roomId} (${room.clients.size} clients remaining)`);
    }
    ws.roomId = null;
  }
}

function handleClipboard(ws, data) {
  if (!ws.roomId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not in a room' }));
    return;
  }

  broadcastToRoom(ws.roomId, {
    type: 'clipboard',
    contentType: data.contentType,
    encryptedContent: data.encryptedContent,
    senderId: ws.id,
    timestamp: Date.now()
  }, ws);

  console.log(`Encrypted clipboard data relayed in room ${ws.roomId}`);
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
  console.log(`Server running on port ${PORT}`);
  console.log(`Access at: http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
