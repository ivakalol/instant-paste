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

// Store rooms and their clients
const rooms = new Map();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'client/build')));

// Helper function to generate a unique room ID using UUID
function generateRoomId() {
  // Generate UUID and take first 8 characters in uppercase for readability
  // Check for collisions with existing room IDs
  let roomId;
  do {
    const uuid = crypto.randomUUID();
    roomId = uuid.replace(/-/g, '').substring(0, 6).toUpperCase();
  } while (rooms.has(roomId));
  return roomId;
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('New client connected');
  
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (message) => {
    try {
      // Try to parse as JSON first (text message)
      let data;
      try {
        const messageStr = message.toString();
        data = JSON.parse(messageStr);
      } catch (parseError) {
        // If parsing fails, treat as binary data
        data = { type: 'binary', data: message };
      }

      // Handle different message types
      switch (data.type) {
        case 'join':
          handleJoin(ws, data.roomId);
          break;
        case 'create':
          handleCreate(ws);
          break;
        case 'leave':
          handleLeave(ws);
          break;
        case 'clipboard':
          handleClipboard(ws, data);
          break;
        case 'binary':
          handleBinary(ws, data.data);
          break;
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    handleLeave(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Handle joining a room
function handleJoin(ws, roomId) {
  if (!roomId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room ID is required' }));
    return;
  }

  // Validate room ID: exactly 6 alphanumeric characters
  if (typeof roomId !== 'string' || !/^[A-Za-z0-9]{6}$/.test(roomId)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid room ID format. Room ID must be exactly 6 alphanumeric characters.' }));
    return;
  }
  roomId = roomId.toUpperCase();
  
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }

  ws.roomId = roomId;
  rooms.get(roomId).add(ws);

  const clientCount = rooms.get(roomId).size;
  
  ws.send(JSON.stringify({ 
    type: 'joined', 
    roomId: roomId,
    clients: clientCount
  }));

  // Notify other clients in the room
  broadcastToRoom(roomId, { 
    type: 'client-joined',
    clients: clientCount
  }, ws);

  console.log(`Client joined room ${roomId} (${clientCount} clients)`);
}

// Handle creating a new room
function handleCreate(ws) {
  // Generate collision-free room ID using UUID
  const roomId = generateRoomId();

  rooms.set(roomId, new Set());
  ws.roomId = roomId;
  rooms.get(roomId).add(ws);

  ws.send(JSON.stringify({ 
    type: 'created', 
    roomId: roomId,
    clients: 1
  }));

  console.log(`Room ${roomId} created`);
}

// Handle leaving a room
function handleLeave(ws) {
  if (ws.roomId && rooms.has(ws.roomId)) {
    const room = rooms.get(ws.roomId);
    room.delete(ws);

    const clientCount = room.size;

    if (clientCount === 0) {
      rooms.delete(ws.roomId);
      console.log(`Room ${ws.roomId} deleted (empty)`);
    } else {
      // Notify remaining clients
      broadcastToRoom(ws.roomId, { 
        type: 'client-left',
        clients: clientCount
      });
      console.log(`Client left room ${ws.roomId} (${clientCount} clients remaining)`);
    }

    ws.roomId = null;
  }
}

// Handle clipboard data
function handleClipboard(ws, data) {
  if (!ws.roomId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not in a room' }));
    return;
  }

  // Validate contentType
  const validContentTypes = ['text', 'image', 'video'];
  if (!data.contentType || !validContentTypes.includes(data.contentType)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid content type' }));
    return;
  }

  // Validate content exists and size
  if (!data.content || typeof data.content !== 'string') {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid content' }));
    return;
  }

  // Enforce content size limit
  // For text: 50MB of text
  // For binary (images/videos): 50MB decoded from base64 (~37.5MB original file becomes ~50MB base64)
  const MAX_CONTENT_SIZE = 50 * 1024 * 1024; // 50MB
  let decodedSize = 0;
  
  if (data.contentType === 'text') {
    // For text, measure string byte length directly
    decodedSize = Buffer.byteLength(data.content, 'utf8');
  } else {
    // For images/videos, decode base64 to get actual size
    try {
      decodedSize = Buffer.from(data.content, 'base64').length;
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid base64 content' }));
      return;
    }
  }
  
  if (decodedSize > MAX_CONTENT_SIZE) {
    ws.send(JSON.stringify({ type: 'error', message: 'Content too large. Maximum size is 50MB' }));
    return;
  }

  // Broadcast clipboard data to all other clients in the room
  broadcastToRoom(ws.roomId, {
    type: 'clipboard',
    contentType: data.contentType,
    content: data.content,
    timestamp: Date.now()
  }, ws);

  console.log(`Clipboard data relayed in room ${ws.roomId} (${data.contentType})`);
}

// Handle binary data (images/videos)
function handleBinary(ws, binaryData) {
  if (!ws.roomId) {
    return;
  }

  // Relay binary data to all other clients in the room
  const room = rooms.get(ws.roomId);
  if (room) {
    room.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(binaryData);
      }
    });
  }
}

// Broadcast message to all clients in a room
function broadcastToRoom(roomId, data, excludeWs = null) {
  const room = rooms.get(roomId);
  if (!room) return;

  const message = JSON.stringify(data);
  
  // Use setImmediate to prevent blocking event loop with large broadcasts
  setImmediate(() => {
    room.forEach((client) => {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });
}

// Heartbeat to keep connections alive
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

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access at: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
