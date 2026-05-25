# Instant Paste 📋

## The Idea 💡

We've all been there: you find a great link, image, or snippet of text on your phone and need it on your laptop *right now*. Emailing it to yourself feels clunky, and chat apps compress images.

**Instant Paste** solves this. It's a real-time clipboard synchronization tool that lets you instantly share text, images, and even videos between any of your devices just by opening a web page. No accounts, no installs, just a room code and you're connected. It supports end-to-end encryption so your data stays yours.

I currently host my own instance on low-power hardware, proving that you don't need expensive servers to run useful realtime tools.

## How It Works ⚙️

The magic happens through **WebSockets**, which allow for a persistent, two-way connection between your devices and the server.

1.  **Room Creation:** When you open the site, you join a specific "room".
2.  **Real-Time Sync:** As soon as you paste something on one device, the content is sent to the server and instantly broadcast to every other device in that same room.
3.  **Security:** Text and user-facing file metadata use browser-native **Web Crypto API** end-to-end encryption whenever the page is loaded in a secure context. The server still sees room activity and declared file sizes for transfer policy enforcement. File bytes are optimized for speed by default, with an optional file-encryption toggle when you need the server to relay encrypted file bytes only.

It's built with a **React** frontend for a snappy user experience and a **Node.js** backend to handle the high-speed traffic.

## File Structure 📂

Here is a quick overview of how the project is organized:

-   `server.js` - The brain of the backend. It handles the WebSocket connections and simple API requests.
-   `client/` - The React frontend code lives here.
    -   `public/` - Static assets like icons and the HTML entry point.
    -   `src/`
        -   `components/` - Reusable UI blocks (like the Clipboard area, Room selector, etc.).
        -   `pages/` - The main views of the app.
        -   `utils/` - Helper functions for encryption (`e2ee.ts`), clipboard access, and more.
        -   `App.tsx` - The main component tying everything together.

## Troubleshooting 🔧

**"I can't see my other device!"**
*   Double-check that both devices have entered the **exact same Room ID**.
*   Ensure both devices are connected to the internet.

**"The Paste button isn't doing anything."**
*   **Security Check:** Browsers only allow "one-click paste" on secure (HTTPS) connections.
*   **Manual Backup:** If the button fails, just use the standard **Ctrl+V** (PC) or **Long Press > Paste** (Mobile) inside the paste area. It works every time!

**"It says 'Disconnected' or 'Connection Lost'."**
*   On mobile, browsers often "sleep" tabs that are in the background to save battery. If you've been away for a while, just refresh the page to reconnect.

**"My file/image isn't sending."**
*   **Size Limit:** The default maximum is 1GB. Files larger than 150MB require the large-file upload password, and the server enforces that limit even if a custom client bypasses the browser prompt.
*   **Slow Uploads:** The app sends files as binary WebSocket frames and uses 2MB chunks to reduce overhead on small servers such as a Raspberry Pi. Enabling file encryption is safer for untrusted servers but costs extra CPU on every sender and receiver.

## Raspberry Pi Deployment Notes

For best results on a Raspberry Pi, build the React client once with `npm run build` and run `NODE_ENV=production node server.js` behind HTTPS, Cloudflare Tunnel, or another trusted reverse proxy. Set `ALLOWED_ORIGINS`, `HEALTH_PASSWORD`, and `LARGE_FILE_PASSWORD` in `.env` before exposing it outside your LAN.

## Contributing 🤝

Contributions are welcome! Please feel free to submit a Pull Request.

## License 📄

MIT License - see LICENSE file for details

## Author ✍️

Ivaylo Chernev

## Acknowledgments 🙏

Inspired by copypaste.me with enhanced features for full clipboard support.
