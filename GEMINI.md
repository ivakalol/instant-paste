# Project Overview

This is a real-time clipboard synchronization web application called "Instant Paste". It allows users to share text, images, and videos between devices instantly through a web browser.

**Main Technologies:**

*   **Backend:** Node.js with Express.js for the web server and the `ws` library for WebSocket-based real-time communication.
*   **Frontend:** React with TypeScript, built using `create-react-app`.
*   **Encryption:** `crypto-js` is used for optional client-side AES encryption of clipboard data.

**Architecture:**

The application follows a client-server architecture. The backend server manages "rooms" that clients can create or join. When a client sends clipboard data, the server broadcasts it to all other clients in the same room. The frontend is a single-page application (SPA) that communicates with the backend via WebSockets. Clipboard history is stored locally in the browser's `localStorage`.

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

This section summarizes the development and setup session.

1.  **Initial Setup and Debugging:**
    *   Provided initial instructions for running the project on an Android device using Termux (`pkg install nodejs`, `npm run setup`, `npm start`).
    *   Diagnosed and fixed a TypeScript compilation error (`TS2448: Block-scoped variable 'showToast' used before its declaration`) in `client/src/App.tsx`. The fix involved reordering the `showToast` function declaration to be before the `useEffect` hook that utilized it.
    *   The fix was committed to the repository.

2.  **Network Configuration:**
    *   **Local Network Access:** Confirmed that the Node.js server (`server.js`) is already configured to accept connections from other devices on the same local network. Instructed the user on how to find their phone's local IP address using `ifconfig` in Termux to access the service.
    *   **External Network Access:** Guided the user to expose the local server to the internet using `cloudflared`. This involved installing `cloudflared` via `pkg` in Termux and running `cloudflared tunnel --url http://localhost:3000` to generate a public-facing URL.
