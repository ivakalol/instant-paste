# Project Overview

This is a real-time clipboard synchronization web application called "Instant Paste". It allows users to share text, images, and videos between devices instantly through a web browser.

**Main Technologies:**

*   **Backend:** Node.js with Express.js for the web server and the `ws` library for WebSocket-based real-time communication.
*   **Frontend:** React with TypeScript, built using `create-react-app`.
*   **Routing:** `react-router-dom` for client-side routing.
*   **Encryption:** End-to-end encryption implemented using the `window.crypto.subtle` API.
*   **QR Code:** `qrcode.react` for generating QR codes for room joining.

**Architecture:**

The application follows a client-server architecture. The backend server manages "rooms" that clients can create or join. When a client sends clipboard data, the server broadcasts it to all other clients in the same room. All data is end-to-end encrypted, meaning the server cannot read the content. The frontend is a single-page application (SPA) that communicates with the backend via WebSockets. Clipboard history is stored locally in the browser's `localStorage`.

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

# Session Summary (2025-11-17)

This session involved initial setup, major feature implementation, and subsequent debugging.

### 1. Initial Setup and Network Configuration
*   Provided initial instructions for running the project on an Android device using Termux.
*   Diagnosed and fixed an initial TypeScript compilation error (`TS2448`).
*   Guided the user on how to access the server from the local network and how to expose it to the internet using `cloudflared`.

### 2. Major Feature Implementation
*   **URL-based Rooms and Routing:** Added `react-router-dom` and refactored the application to use URL-based rooms (e.g., `/{roomId}`), allowing users to stay in the same room on page refresh.
*   **QR Code for Room Joining:** Added `qrcode.react` and implemented a feature to display a QR code of the room's URL for easy joining from mobile devices.
*   **End-to-End Encryption (E2EE):** Replaced the password-based encryption with a more secure E2EE implementation using the `window.crypto.subtle` API. The server now only relays encrypted data.
*   **Auto-Copy Feature Improvements:** Improved the auto-copy feature by adding permission checks and a clearer UI status indicator.

### 3. Post-Implementation Debugging and Resolution
*   **Compilation Errors:**
    *   Resolved `qrcode.react` import errors by using the specific `QRCodeCanvas` component.
    *   Fixed TypeScript type errors related to `WebSocketMessage` properties (`encryptedContent`, `senderId`) and the `sendMessage` function's return type (`Promise<boolean>`).
    *   Corrected a missing `clientId` in the `leaveRoom` state update.
*   **Functional Issues:**
    *   Restored missing homepage CSS.
    *   Fixed unresponsive "Create New Room" and "Join Room" buttons by ensuring `isReady` state is correctly set even in insecure contexts, and conditionally sending `publicKey` in room creation/joining requests.
    *   Resolved issues with room code display, QR code functionality, Copy ID button, and client count by correctly handling client ID and room state updates in `useWebSocket.ts` and `server.js`.
    *   Fixed messages not being received by correctly handling both encrypted and unencrypted content in `sendMessage` and `handleClipboard` on both client and server.
    *   Resolved a `ReferenceError: handleLeave is not defined` by re-adding the missing function to `server.js`.
*   **UI/UX Improvements:**
    *   Improved spacing and styling for the "Encryption Disabled" status, converting it into a disabled button.
    *   Updated the auto-copy toast message to be more accurate ("Auto-copy requires a secure context (HTTPS).").
*   **Build Status:** The project now builds successfully with only minor ESLint warnings.

### 4. Git Commits
*   All new features, fixes, and improvements were committed to the local git repository with detailed, conventional commit messages.