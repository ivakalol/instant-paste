# Instant Paste 📋

## The Idea 💡

We've all been there: you find a great link, image, or snippet of text on your phone and need it on your laptop *right now*. Emailing it to yourself feels clunky, and chat apps compress images.

**Instant Paste** solves this. It's a real-time clipboard synchronization tool that lets you instantly share text, images, and even videos between any of your devices just by opening a web page. No accounts, no installs, just a room code and you're connected. It supports end-to-end encryption so your data stays yours.

I currently host my own instance on an old Android phone running Linux, proving that you don't need expensive servers to run powerful tools.

## How It Works ⚙️

The magic happens through **WebSockets**, which allow for a persistent, two-way connection between your devices and the server.

1.  **Room Creation:** When you open the site, you join a specific "room".
2.  **Real-Time Sync:** As soon as you paste something on one device, the content is sent to the server and instantly broadcast to every other device in that same room.
3.  **Security:** For those needing extra privacy, you can enable End-to-End Encryption. This uses the **Web Crypto API** right in your browser to encrypt your clipboard data with a password *before* it leaves your device. The server only sees encrypted gibberish; only your devices with the password can read the actual content.

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

**"I enabled encryption and now I see gibberish."** (for when I introduce custom passwords)
*   This happens when the passwords don't match. Make sure every device in the room is using the **exact same encryption password**. 

**"My file/image isn't sending."**
*   **Size Limit:** There is currently a ~50MB limit on files.
*   **Slow Uploads:** If you are on a slow mobile connection, large images might take a few seconds to "pop up" on the other side.

## Contributing 🤝

Contributions are welcome! Please feel free to submit a Pull Request.

## License 📄

MIT License - see LICENSE file for details

## Author ✍️

Ivaylo Chernev

## Acknowledgments 🙏

Inspired by copypaste.me with enhanced features for full clipboard support.