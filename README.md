# Instant Paste 📋

Real-time clipboard sync web app – instantly share text, images, and videos between any devices via browser.

## Features ✨

- **Real-time sync**: Instantly share clipboard content between devices
- **Multi-format support**: Text, images, and videos
- **Direct paste**: Use Ctrl+V/Cmd+V or mobile paste functionality
- **Room system**: Generate or join short room IDs to pair devices
- **End-to-end encryption**: Optional client-side AES encryption with shared password
- **Clipboard history**: Keep track of recent clips (stored locally)
- **Cross-platform**: Works on Windows, macOS, Linux, iOS, Android
- **Lightweight**: Optimized to run on low-end devices
- **PWA support**: Install as a Progressive Web App
- **HTTPS-compatible**: Works with modern clipboard APIs including iPhone Safari

## Quick Start 🚀

### Prerequisites

- Node.js 14 or higher
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ivakalol/instant-paste.git
   cd instant-paste
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd client
   npm install
   cd ..
   ```

3. **Build the client**
   ```bash
   cd client
   npm run build
   cd ..
   ```

4. **Start the server**
   ```bash
   node server.js
   ```

5. **Access the app**
   Open your browser and navigate to `http://localhost:3000`

### One-Line Setup

```bash
npm run setup && npm start
```

## Deployment 🌐

### Running on Termux (Android)

Perfect for old Android phones! This app is designed to be lightweight enough to run on older devices.

1. **Install Termux** from F-Droid

2. **Setup Termux environment**
   ```bash
   pkg update
   pkg install nodejs-lts git
   ```

3. **Clone and run**
   ```bash
   git clone https://github.com/ivakalol/instant-paste.git
   cd instant-paste
   npm install
   cd client && npm install && npm run build && cd ..
   node server.js
   ```

4. **Access from other devices**
   
   Find your phone's local IP:
   ```bash
   ifconfig wlan0 | grep 'inet '
   ```
   
   Then access from other devices: `http://YOUR_PHONE_IP:3000`

### External Access (cloudflared/ngrok)

To access your server from anywhere (e.g., iPhone ↔ Windows across different networks):

**Using Cloudflare Tunnel (cloudflared):**

1. **Install cloudflared**
   ```bash
   # On Termux
   pkg install cloudflared
   
   # On other systems, download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
   ```

2. **Create tunnel**
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

3. **Access via the provided URL** (e.g., `https://random-name.trycloudflare.com`)

**Using ngrok:**

1. **Install ngrok** from https://ngrok.com/download

2. **Create tunnel**
   ```bash
   ngrok http 3000
   ```

3. **Access via the provided URL**

### Production Deployment

For production deployment on a VPS or cloud provider:

1. **Set environment variables**
   ```bash
   export PORT=3000
   ```

2. **Use a process manager** (e.g., PM2)
   ```bash
   npm install -g pm2
   pm2 start server.js --name instant-paste
   pm2 save
   pm2 startup
   ```

3. **Setup reverse proxy** (nginx/Apache) for HTTPS

## Usage 📖

### Creating/Joining a Room

1. **Create a new room**: Click "Create New Room" to generate a unique 6-character room ID
2. **Join existing room**: Enter the room ID and click "Join Room"
3. **Share room ID**: Share the room ID with devices you want to sync with

### Syncing Content

1. **Paste content**:
   - Press Ctrl+V (or Cmd+V on Mac) in the paste area
   - On mobile: tap the paste area and select "Paste"
   - Drag & drop files into the paste area
   - Click "Choose File" to select from your device

2. **Receive content**:
   - Content from other devices appears automatically in the history
   - Click 📋 to copy text to clipboard
   - Click 💾 to download content

### Encryption (Optional)

1. Click "🔐 Enable Encryption"
2. Enter a shared password (must be the same on all devices in the room)
3. All clipboard data will be encrypted before transmission

### PWA Installation

On supported browsers:
1. Look for "Install" or "Add to Home Screen" prompt
2. Install to use like a native app

## Architecture 🏗️

### Backend
- **Node.js + Express**: HTTP server for serving the React app
- **WebSocket (ws)**: Real-time bidirectional communication
- **Room-based routing**: Isolated sessions for different device pairs

### Frontend
- **React + TypeScript**: Component-based UI
- **Modern Clipboard API**: For direct paste support
- **WebSocket client**: Real-time sync
- **CryptoJS**: Client-side encryption
- **LocalStorage**: Clip history cache

### Data Flow

```
Device A                    Server                     Device B
   |                          |                            |
   |----Create/Join Room----->|                            |
   |<----Room ID Assigned-----|                            |
   |                          |<----Join Same Room---------|
   |                          |----Confirm Join----------->|
   |                          |                            |
   |----Paste Content-------->|                            |
   |                          |----Relay Content---------->|
   |                          |                            |
   |<---Paste Content---------|<----Paste Content----------|
```

## Browser Compatibility 🌐

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Full support (including iOS Safari with HTTPS)
- **Mobile browsers**: Tested on iOS Safari, Chrome Mobile, Firefox Mobile

**Note**: For full clipboard API support, the app should be accessed via HTTPS (or localhost for development).

## Security 🔒

- **Client-side encryption**: All encryption happens in the browser
- **No server storage**: The server only relays data, nothing is stored
- **Room-based isolation**: Data is only shared within the same room
- **Optional passwords**: Rooms can be password-protected with encryption

## Limitations ⚠️

- Maximum file size: ~37.5MB original file size (~50MB base64-encoded, configurable in server.js)
- Binary data is base64 encoded for WebSocket transmission (increases size by ~33%)
- Clipboard history is stored locally (browser localStorage)
- Video support depends on browser codec support

## Development 🛠️

### Running in development mode

**Server**:
```bash
npm run dev
```

**Client** (with hot reload):
```bash
cd client
npm start
```

The client dev server runs on port 3001 and proxies API calls to port 3000.

## Troubleshooting 🔧

### "Cannot read clipboard" errors
- Ensure you're using HTTPS or localhost
- Grant clipboard permissions in browser settings
- Try using Ctrl+V instead of programmatic clipboard access

### WebSocket connection fails
- Check firewall settings
- Ensure the port is not blocked
- Verify the WebSocket URL in browser console

### Binary data not syncing
- Check file size limits (default 50MB)
- Ensure browser supports required codecs
- Check browser console for errors

## Contributing 🤝

Contributions are welcome! Please feel free to submit a Pull Request.

## License 📄

MIT License - see [LICENSE](LICENSE) file for details

## Author ✍️

Ivaylo Chernev

## Acknowledgments 🙏

Inspired by [copypaste.me](https://copypaste.me/) with enhanced features for full clipboard support.
