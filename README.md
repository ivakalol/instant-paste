# Instant Paste 📋

A real-time, end-to-end encrypted clipboard and file sharing application.

**Live Instance:** [https://paste.ivaylo.tech](https://paste.ivaylo.tech)

---

## Features 🚀

- **Instant Sync:** Seamless sharing of text and files between devices.
- **Secure:** End-to-end encryption using the Web Crypto API.
- **No Friction:** No accounts, no installations—just join a room.
- **Performance:** Efficient binary protocol over WebSockets for fast transfers.

## Technologies 🛠️

- **Frontend:** React, TypeScript, Vanilla CSS.
- **Backend:** Node.js, Express, WebSockets (`ws`).
- **Encryption:** Browser-native Web Crypto API.

## Quick Start 🚀

*See [QUICKSTART.md](./QUICKSTART.md) for detailed installation and deployment instructions.*

1. **Install dependencies:** `npm install && cd client && npm install`
2. **Build client:** `npm run build:client`
3. **Start server:** `npm start`

## File Structure 📂

- `server.js` - Backend logic, WebSocket management, and API handling.
- `client/` - React frontend application.
    - `src/components/` - Reusable UI components.
    - `src/pages/` - Main views (e.g., Room page).
    - `src/utils/` - Helper functions for E2EE, clipboard, etc.

## Contributing 🤝

Contributions are welcome! Please feel free to submit a Pull Request.

## License 📄

MIT License - see LICENSE file for details

## Author ✍️

Ivaylo Chernev

## Acknowledgments 🙏

Inspired by copypaste.me with enhanced features for full clipboard support.
