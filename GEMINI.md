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
*   Diagnosed and fixed an an initial TypeScript compilation error (`TS2448`).
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

### 5. Further Enhancements and Debugging
*   **ESLint Warnings Resolution:**
    *   Resolved `'setIsE2eeEnabled' is assigned a value but never used` by refactoring `isE2eeEnabled` state management in `useWebSocket.ts` to directly update the state without an unused setter.
    *   Resolved `react-hooks/exhaustive-deps` warning related to `retryTimeoutRef` by removing the unused ref and its associated cleanup logic from `useWebSocket.ts`.
*   **New Feature Implementation:**
    *   **Clip Deletion:** Added a "Delete" button to each clipboard item in the history, allowing users to remove individual clips.
    *   **Text Expansion:** Implemented an "Expand" / "Collapse" button for text clips in the history, enabling users to view the full content of truncated text entries.
    *   **Enlarged Paste/Type Area:** Increased the default size of the text input field for pasting or typing content for improved usability.
*   **Persistent Import Error Resolution:**
    *   Addressed a recurring `Attempted import error: '../components/ClipboardArea' does not contain a default export` by simplifying the export/import mechanism for the `ClipboardArea` component. This involved ensuring `ClipboardArea.tsx` exclusively used a default export and `Room.tsx` imported it as such, resolving module resolution conflicts.

### 6. Current Session (2025-11-17) - PWA, HTTPS, and Cloudflare Tunneling

This session focused on resolving issues related to the Instant Paste web application's behavior when added to an iPhone desktop shortcut, and then on setting up persistent HTTPS access using Cloudflare Tunneling.

*   **PWA Functionality on iOS:**
    *   Identified that the service worker registration in `client/src/index.tsx` was commented out, preventing full PWA functionality.
    *   Uncommented the service worker registration code to enable PWA features, which should improve behavior when added to the home screen.
    *   Provided general advice on ensuring HTTPS, clearing browser cache, re-adding the shortcut, and understanding iOS clipboard permissions.
    *   Committed the change to enable the service worker.

*   **Adding HTTPS:**
    *   Provided detailed instructions on how to add HTTPS for local development using `cloudflared` and `ngrok`.
    *   Briefly explained HTTPS setup for production deployments (reverse proxies, managed hosting).

*   **Cloudflare Tunneling Issues & Persistent URL:**
    *   Addressed the user's request for a persistent URL with `cloudflared`.
    *   Provided step-by-step instructions for creating a named Cloudflare Tunnel, including authentication, tunnel creation, configuration (`config.yml`), and DNS routing.
    *   Generated a template `config.yml` file for the user, with placeholders for their specific tunnel ID, credentials path, and desired hostname.
    *   Troubleshot user errors during `cloudflared` setup:
        *   Corrected the `cloudflared tunnel create` command by reminding the user to provide a tunnel name.
        *   Diagnosed a `cert.pem` error, explaining it's due to a missing or failed `cloudflared tunnel login`, and provided steps to re-authenticate and verify the certificate.

*   **University Wi-Fi Restrictions:**
    *   Diagnosed a `cloudflared` error (`lookup cfd-features.argotunnel.com on 8.8.4.4:53: dial udp 8.8.4.4:53: i/o timeout`) as a network restriction (blocked external DNS).
    *   Reiterated solutions: using a VPN, mobile hotspot, or trying `ngrok`.
    *   Provided a list of reputable free VPNs for Android, along with critical warnings about their limitations and risks, and reiterated the recommendation for paid VPN services.

### 7. Current Session (2025-11-18) - Auto-Copy Fix, History Management, Dark Mode, and UI Refinements

This session focused on enhancing user experience and fixing minor issues.

*   **Auto-Copy Fix for Firefox:**
    *   Implemented a fallback mechanism for `navigator.clipboard.writeText` using `document.execCommand('copy')` to ensure auto-copy functionality works in Firefox, which has stricter security policies for clipboard access.
    *   Added a check to ensure `message.content` is defined before attempting to copy, resolving a TypeScript compilation error (`TS2345`).
*   **Clipboard History Management:**
    *   **Clear All Clips:** Added a "Clear All" button to the `RoomInfo` component, allowing users to clear their entire clipboard history for the current room. This action also clears the history from `localStorage`.
    *   **Auto-Delete Old Clips:** Implemented a `useEffect` hook in `Room.tsx` that automatically removes clipboard items older than 30 minutes from the history, ensuring a cleaner and more manageable history.
*   **Dark Mode Implementation:**
    *   **CSS Variables:** Defined a comprehensive set of CSS variables for colors in `index.css` for both light and dark themes.
    *   **Theming Logic:** Implemented a `ThemeContext` in `App.tsx` to manage the `isDarkMode` state and persist the user's theme preference in `localStorage`. The `dark-mode` class is dynamically applied to the `body` element.
    *   **Component Integration:** Integrated the `useTheme` hook and a theme toggle button into the `RoomInfo` component, allowing users to switch between light and dark modes.
    *   **Styling Updates:** Updated `App.css` and `QRCodeModal.css` to utilize the new CSS variables, ensuring a consistent look across both themes.
*   **UI Refinements:**
    *   **Modern Typography:** Integrated the "Inter" font from Google Fonts for a more modern and readable typography.
    *   **Button Styling:** Improved the visual appearance of the "Send Text" and "Choose File" buttons in `ClipboardArea.tsx`, making them more prominent and consistent with the new design language.
    *   **Iconography:** Replaced emoji icons with more professional SVG icons for various actions (QR Code, Copy ID, Leave, Encryption, Clear All, Theme Toggle) in `RoomInfo.tsx`.
    *   **Layout and Spacing:** Adjusted spacing between buttons in `ClipboardArea.tsx` for better visual separation.
    *   **RoomSelector Enhancements:** Added a new list item to the "How it works" section in `RoomSelector.tsx` and applied a slight opacity to the text for a softer look.
*   **Import/Export Corrections:**
    *   Resolved import/export errors related to `RoomInfo` component by ensuring consistent default exports and imports across `Room.tsx` and `Room.tsx`.

### 8. Current Session (2025-11-18) - Cloudflare Tunnel and Domain Setup

This session focused on connecting the application to a custom domain (`ivaka-website.me`) using a persistent Cloudflare Tunnel.

*   **Domain and Tunnel Setup:**
    *   Guided the user to add their Namecheap domain (`ivaka-website.me`) to their Cloudflare account and update the nameservers.
    *   Troubleshot several `cloudflared` errors on Termux:
        *   `cannot determine default origin certificate path`: Resolved by having the user re-run `cloudflared tunnel login` on an unrestricted network after deleting the old (likely corrupt) `cert.pem` file.
        *   `no tunnels found`: Resolved by running `cloudflared tunnel create instant-paste-tunnel` to create a new persistent tunnel.
*   **DNS and Ingress Routing:**
    *   Initially, the user's browser showed a GitHub Pages error, which was diagnosed as an incorrect DNS record.
    *   The user's DNS zone in Cloudflare was found to be empty.
    *   Guided the user to create a `CNAME` record pointing the root domain (`ivaka-website.me`) to the tunnel.
    *   Adapted the plan to use the root domain as per the user's request, which involved updating the `hostname` in `config.yml` to `ivaka-website.me`.
*   **Final Tunnel Debugging and Success:**
    *   A persistent `WRN No ingress rules were defined...` error indicated the `config.yml` file was not being parsed correctly due to syntax or path errors.
    *   The breakthrough came from bypassing the config file and using command-line flags instead: `cloudflared tunnel --url http://localhost:3000 --hostname ivaka-website.me run instant-paste-tunnel`.
    *   This command worked, proving all other components (DNS, tunnel auth, backend server) were correct and isolating the issue to the `config.yml` file.
    *   The application was successfully brought online at `https://ivaka-website.me`.
    *   Finally, the user was provided with a corrected `config.yml` template to enable the simpler, persistent `cloudflared tunnel run instant-paste-tunnel` command for future use.

### 9. Current Session (2025-11-19) - UI/UX Enhancements, Bug Fixes, and Build System Improvements

This session focused on significant UI/UX enhancements, resolving critical build issues, improving client-server synchronization, and enhancing server observability.

*   **UI/UX Improvements:**
    *   **RoomSelector Feature Section Redesign:** The "How it works" section in `RoomSelector.tsx` was redesigned from a simple list to a more visually appealing grid of feature cards with SVG icons.
    *   **Mobile Responsiveness for Features:** Added specific media queries to `App.css` to ensure the redesigned feature section adapts gracefully to smaller screens, adjusting grid layout, padding, font sizes, and icon sizes for optimal mobile display.
*   **Bug Fixes:**
    *   **Client Count Accuracy:** Resolved a bug where the client count in rooms was consistently off by +1. This was fixed by making the server (`server.js`) the authoritative source for client counts, including the count in `client-joined` and `client-left` messages. The client (`client/src/utils/useWebSocket.ts`) was updated to use this server-provided count directly.
    *   **Image Copy Functionality:** Addressed the inability to copy images from the clipboard history. The `handleCopy` function in `ClipboardArea.tsx` was extended to correctly handle image types by fetching data URLs as Blobs and using the modern `navigator.clipboard.write` API. It also includes appropriate error handling and user feedback for unsupported types or browser limitations.
*   **Build System Improvements & Debugging:**
    *   **Service Worker Auto-Update:** Implemented a robust auto-update mechanism for the service worker. This involved adding a `controllerchange` event listener in `client/src/index.tsx` to automatically reload the page when a new service worker activates, combined with a periodic update check, effectively solving stale content issues.
    *   **Persistent Build Error Resolution:** Diagnosed and fixed a stubborn `Attempted import error: 'ClipboardItem' is not exported` error during client build. This was resolved by refactoring the `ClipboardItem` interface from `client/src/types/index.ts` into its own dedicated file (`client/src/types/ClipboardItem.ts`), and updating all import statements to directly reference this new file, bypassing a module resolution ambiguity.
*   **Server Observability:**
    *   **Enhanced Server-Side Logging:** Implemented a structured logging utility in `server.js` with `INFO`, `WARN`, and `ERROR` levels. All `console.log`/`console.error` calls were replaced with the new utility, providing more contextual information (e.g., room ID, client ID, client counts).
    *   **Room Status Monitoring:** Added a `logRoomStatus` function to `server.js` which provides periodic and event-driven summaries of active rooms and their client counts, enhancing server state visibility.
*   **Troubleshooting Cloudflare Tunnel:**
    *   Diagnosed user-reported "Cloudflare Tunnel error 1033" as an issue with `cloudflared` not running or being blocked by network restrictions (student WiFi without VPN). Provided guidance on restarting `cloudflared` and using a VPN or mobile hotspot.

*   **Auto-Copy Fix for Firefox:**
    *   Implemented a fallback mechanism for `navigator.clipboard.writeText` using `document.execCommand('copy')` to ensure auto-copy functionality works in Firefox, which has stricter security policies for clipboard access.
    *   Added a check to ensure `message.content` is defined before attempting to copy, resolving a TypeScript compilation error (`TS2345`).
*   **Clipboard History Management:**
    *   **Clear All Clips:** Added a "Clear All" button to the `RoomInfo` component, allowing users to clear their entire clipboard history for the current room. This action also clears the history from `localStorage`.
    *   **Auto-Delete Old Clips:** Implemented a `useEffect` hook in `Room.tsx` that automatically removes clipboard items older than 30 minutes from the history, ensuring a cleaner and more manageable history.
*   **Dark Mode Implementation:**
    *   **CSS Variables:** Defined a comprehensive set of CSS variables for colors in `index.css` for both light and dark themes.
    *   **Theming Logic:** Implemented a `ThemeContext` in `App.tsx` to manage the `isDarkMode` state and persist the user's theme preference in `localStorage`. The `dark-mode` class is dynamically applied to the `body` element.
    *   **Component Integration:** Integrated the `useTheme` hook and a theme toggle button into the `RoomInfo` component, allowing users to switch between light and dark modes.
    *   **Styling Updates:** Updated `App.css` and `QRCodeModal.css` to utilize the new CSS variables, ensuring a consistent look across both themes.
*   **UI Refinements:**
    *   **Modern Typography:** Integrated the "Inter" font from Google Fonts for a more modern and readable typography.
    *   **Button Styling:** Improved the visual appearance of the "Send Text" and "Choose File" buttons in `ClipboardArea.tsx`, making them more prominent and consistent with the new design language.
    *   **Iconography:** Replaced emoji icons with more professional SVG icons for various actions (QR Code, Copy ID, Leave, Encryption, Clear All, Theme Toggle) in `RoomInfo.tsx`.
    *   **Layout and Spacing:** Adjusted spacing between buttons in `ClipboardArea.tsx` for better visual separation.
    *   **RoomSelector Enhancements:** Added a new list item to the "How it works" section in `RoomSelector.tsx` and applied a slight opacity to the text for a softer look.
*   **Import/Export Corrections:**
    *   Resolved import/export errors related to `RoomInfo` component by ensuring consistent default exports and imports across `Room.tsx` and `Room.tsx`.

### 10. Current Session (2025-11-19) - WebSocket Refactor and Inactive Room Shutdown

This session focused on resolving a persistent bug with the client count and implementing a new feature to shut down inactive rooms.

*   **WebSocket Refactor:**
    *   **Simplified Client-Side Logic:** The client-side code in `useWebSocket.ts` was refactored to use a single `room-update` message from the server. This eliminates the need for the client to perform any calculations to determine the client count, making the client-side logic simpler and more robust.
    *   **Simplified Server-Side Logic:** The server-side logic in `server.js` was also simplified to use a single `room-update` message. This makes the server the single source of truth for the room state and eliminates the race conditions that were causing the client count to be incorrect.
*   **Inactive Room Shutdown:**
    *   **`lastActivity` Timestamp:** A `lastActivity` timestamp was added to each room object. This timestamp is updated whenever there is activity in the room.
    *   **Periodic Check for Inactive Rooms:** A `setInterval` was added to the server to check for and shut down inactive rooms every minute. A room is considered inactive if it has been inactive for more than 1 hour.
*   **Log Coloring:**
    *   The "Active Rooms Status" logs are now colored green to make them more readable.

# Interaction Model for Gemini CLI

This project is primarily developed and tested on a separate device. The Gemini CLI's role is to assist with code modifications and provide changes for review.

**Important Guidelines for Gemini CLI:**

*   **Do NOT execute `npm run` commands:** All build, test, and run commands are handled on the external device.
*   **Do NOT execute `git push`:** All `git push` operations are handled manually by the user on the external device.
*   **Testing and Building:** Assume that testing and building will be performed by the user on the external device after code changes are provided.

### 11. Current Session (2025-11-19) - Storage Overhaul and File Handling Improvements

This session focused on overhauling the client-side storage system to support larger files and implementing several new features and improvements related to file handling.

*   **Storage System Overhaul (IndexedDB):**
    *   Replaced the `localStorage` system with `IndexedDB` to resolve storage quota errors and significantly increase the capacity for clipboard history on the user's device.
    *   Created a new utility module `client/src/utils/indexedDB.ts` to manage all database interactions.
    *   Refactored `client/src/pages/Room.tsx` to use the new IndexedDB service for all history persistence (loading, saving, and clearing).

*   **Enhanced File Handling & UX:**
    *   **Generic File Support:** Implemented the ability to upload any file type, not just images, videos, and text. This involved updating the data model (`ClipboardItem.ts`), server-side message handling (`server.js`), and client-side processing logic (`Room.tsx`, `ClipboardArea.tsx`).
    *   **File Metadata Display:** Added the file size to the data model and UI. The history now displays the filename and size (e.g., "document.pdf (2.1 MB)") for a better user experience.
    *   **Large File Upload Gate:** Implemented a password prompt for uploading large files. The threshold for this prompt was adjusted from an initial 50MB to **150MB** based on user feedback for experimentation.

*   **Bug Fixes:**
    *   Resolved a TypeScript compilation error in `Room.tsx` by updating the shared `WebSocketMessage` interface in `client/src/types/index.ts` to include the new `fileName` and `fileSize` properties.

*   **Technical Discussions:**
    *   Provided detailed explanations on why `IndexedDB` is the superior choice over `localStorage` or a hybrid approach.
    *   Clarified how data persistence and deletion works (items are stored locally, not on the server, and are pruned after 30 minutes or when the 20-item history limit is exceeded).
    *   Explained how to inspect `IndexedDB` data on an Android device using remote debugging via a desktop computer, and clarified that direct on-device inspection is not possible.

*   **Git Commits:**
    *   All new features, improvements, and fixes were committed to the local `feature/phonestorage` branch.
    *   Guided the user on how to push a new local branch to a remote repository for the first time.