# Project Overview

This is a real-time clipboard synchronization web application called "Instant Paste". It allows users to share text, images, and videos between devices instantly through a web browser.

**Main Technologies:**

*   **Backend:** Node.js with Express.js for the web server and the `ws` library for WebSocket-based real-time communication.
*   **Frontend:** React with TypeScript, built using `create-react-app`.
*   **Routing:** `react-router-dom` for client-side routing.
*   **Encryption:** End-to-end encryption implemented using the `window.crypto.subtle` API.
*   **QR Code:** `qrcode.react` for generating QR codes for room joining.

**Architecture:**

The application follows a client-server architecture. The backend server manages "rooms" that clients can create or join. When a client sends clipboard data, the server broadcasts it to all other clients in the same room. All data is end-to-end encrypted, meaning the server cannot read the content. The frontend is a single-page application (SPA) that communicates with the backend via WebSockets. Clipboard history is stored locally in the browser's `IndexedDB` for large capacity, with `localStorage` being used for theme preferences and the recent rooms list.

# Project Structure
/mnt/c/Git Hub/instant-paste/instant-paste/
├───.gitignore
├───.npmrc
├───CONTRIBUTING.md
├───FEATURES.md
├───LICENSE
├───package-lock.json
├───package.json
├───QUICKSTART.md
├───README.md
├───server.js
└───client/
    ├───package-lock.json
    ├───package.json
    ├───tsconfig.json
    ├───public/
    │   ├───favicon.ico
    │   ├───index.html
    │   ├───logo192.png
    │   ├───logo512.png
    │   ├───manifest.json
    │   └───service-worker.js
    └───src/
        ├───App.css
        ├───App.tsx
        ├───index.css
        ├───index.tsx
        ├───components/
        │   ├───ClipboardArea.tsx
        │   ├───QRCodeModal.css
        │   ├───QRCodeModal.tsx
        │   ├───RoomInfo.tsx
        │   ├───RoomSelector.tsx
        │   └───Toast.tsx
        ├───pages/
        │   └───Room.tsx
        ├───types/
        │   ├───ClipboardItem.ts
        │   └───index.ts
        └───utils/
            ├───clipboard.ts
            ├───crypto.ts
            ├───e2ee.ts
            ├───indexedDB.ts
            ├───recentRooms.ts
            └───useWebSocket.ts

# Building and Running

The project includes scripts in `package.json` to streamline the development and build process.

**Key Commands:**

*   **One-Line Setup (install dependencies and build the client):**
    ```bash
    npm run setup
    ```

*   **Start the server:**
    ```bash
    npm start
    ```
    The application will be available at `http://localhost:3000`.

*   **Run in development mode:**
    *   **Server (with auto-restart):**
        ```bash
        npm run dev
        ```
    *   **Client (with hot reload):**
        ```bash
        cd client
        npm start
        ```

*   **Build the client for production:**
    ```bash
    npm run build:client
    ```

# Development Conventions

*   **Code Style:** The code is well-formatted and follows standard conventions for both JavaScript (backend) and TypeScript/React (frontend).
*   **Testing:** The `client/package.json` includes a `test` script, suggesting that the frontend has a testing setup using `react-scripts`.
*   **Contribution:** The `CONTRIBUTING.md` file (not read, but present) suggests that there are guidelines for contributing to the project.

# Session Summary (2025-11-22)

This session focused on implementing robust large file transfers, adding QR code sharing for easier room joining, and fixing several related bugs.

*   **File Transfer Overhaul (Chunking & Progress Bars):**
    *   **Chunking Implementation:** To support large files, the application now sends files in 1MB chunks instead of as a single payload. This avoids browser memory limits and WebSocket message size constraints.
    *   **Server as a Relay:** The Node.js server was updated to act as a lightweight relay for these chunks, immediately broadcasting them to other clients without reassembling them on the server, which keeps server memory usage low.
    *   **UI Progress Bars:** The user interface now displays progress bars for both uploads and downloads, providing clear visual feedback to the user. The progress text also updates to "Uploaded" or "Downloaded" upon completion.
    *   **Critical Bug Fix (`atob` error):** A persistent `DOMException: String contains an invalid character` error was occurring on the receiving client when reassembling files. After several attempts to fix it (including switching encoding methods), the issue was resolved by changing the reassembly logic to process each Base64 chunk individually instead of joining them into a single, massive string that was crashing the browser's `atob` function.

*   **QR Code Sharing:**
    *   A "QR Code" button was added to the room interface.
    *   Clicking the button opens a modal displaying a QR code of the room's URL, allowing for quick joining from mobile devices.
    *   Fixed a bug where the wrong props were being passed to the `QRCodeModal` component and corrected an issue with the `qrcode.react` library import.

*   **Client-Side Refresh Logic:**
    *   Implemented a client-side page refresh when a user joins a room with a code, creating a consistent experience with other joining methods.
    *   **Critical Bug Fix (Infinite Reload):** Fixed a major bug where the server-side reload message was causing clients to get stuck in an infinite refresh loop upon joining a room. The fix involved removing the server-side reload and handling the refresh exclusively on the client.

*   **Git Commits:** All new features and bug fixes were committed to the local repository with descriptive, conventional commit messages.
