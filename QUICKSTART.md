# Quick Start Guide

Get Instant Paste running in under 5 minutes!

## Prerequisites

- Node.js 14 or higher ([download here](https://nodejs.org/))
- Git

## Installation

### Option 1: One-Command Setup

```bash
git clone https://github.com/ivakalol/instant-paste.git && \
cd instant-paste && \
npm install && \
cd client && npm install && npm run build && cd .. && \
node server.js
```

Then open http://localhost:3000 in your browser!

### Option 2: Step-by-Step

1. **Clone the repository**
   ```bash
   git clone https://github.com/ivakalol/instant-paste.git
   cd instant-paste
   ```

2. **Install backend dependencies**
   ```bash
   npm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd client
   npm install
   ```

4. **Build the frontend**
   ```bash
   npm run build
   cd ..
   ```

5. **Start the server**
   ```bash
   node server.js
   ```

6. **Open your browser**
   
   Navigate to: http://localhost:3000

## First Use

1. **Create a room**: Click "Create New Room"
2. **Share the room ID**: Give the 6-character room code to other devices
3. **Start pasting**: Press Ctrl+V (or Cmd+V on Mac) to paste content
4. **Watch the magic**: Content appears instantly on all connected devices!

## Common Issues

### Port already in use
If port 3000 is busy, set a different port:
```bash
PORT=8080 node server.js
```

### Build folder not found
Make sure you built the client:
```bash
cd client && npm run build && cd ..
```

### WebSocket connection fails
- Check if a firewall is blocking the connection
- Ensure you're accessing via the correct IP/hostname

## Next Steps

- Check out the [full README](README.md) for more features
- Learn about [deployment options](README.md#deployment-)
- Read the [contributing guide](CONTRIBUTING.md) to help improve the project

## Mobile Access

To access from your phone on the same network:

1. Find your computer's local IP:
   - **Windows**: `ipconfig` (look for IPv4)
   - **Mac/Linux**: `ifconfig` or `ip addr`

2. On your phone's browser, navigate to:
   ```
   http://YOUR_COMPUTER_IP:3000
   ```

## External Access

To access from anywhere (different networks):

**Using cloudflared** (recommended):
```bash
cloudflared tunnel --url http://localhost:3000
```

**Using ngrok**:
```bash
ngrok http 3000
```

Both will give you a public URL to access your server!

---

That's it! You're ready to sync clipboards across all your devices! 🎉
