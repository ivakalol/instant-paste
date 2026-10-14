# Codebase audit and refactor — 2026-10-14

## Architecture and data flow

Express serves the React/TypeScript SPA, dynamic room-specific PWA manifests, a password-verification endpoint, and an authenticated health endpoint. The WebSocket server maintains rooms and transfer bookkeeping in memory. Rooms hold at most ten clients and disappear when empty or inactive. The server relays content; it does not persist clipboard history or file bodies.

Browsers exchange P-256 public keys through room updates. Text and file metadata are encrypted per recipient using ECDH-derived AES-GCM keys when secure-context encryption is available. File content encryption is optional and off by default; when enabled, a per-file AES key is encrypted for each recipient. Files travel in 4 MiB binary chunks. The receiver assembles Blob parts and exposes a session-local object URL. Text history is stored in IndexedDB, limited to twenty top-level clips and aged out after thirty minutes. Collections group multiple file uploads.

## Implemented changes

| Area | Finding and correction |
| --- | --- |
| Protocol validation | Added `server/protocol.js` for envelope, encrypted-payload, key, size, chunk-count, and manifest-path validation. Invalid JSON values and nested encrypted payloads are rejected before dispatch. File-like clipboard content must use the transfer flow. |
| Transfer ownership | Active file IDs must be unique within a room because binary frames have no sender field. File keys cannot overwrite another sender's active transfer. File metadata requires an announced transfer. |
| Transfer integrity | Track the expected next chunk; reject skipped, repeated, or inconsistent chunks. Bound declared/actual sizes, concurrent active transfers, and idle lifetime. Transfer errors include file IDs. Added sender cancellation handling. |
| Resource limits | Bound total WebSocket connections, password-attempt bookkeeping, pending client keys, orphan chunk storage, and the asynchronous receive queue. Rate-limit violations close the connection instead of silently dropping chunks. |
| Password verification | Preserve an active lock after the attempt window expires, validate numeric configuration, return retry guidance for active lockouts, reject disallowed browser origins, and prevent caching upload tokens. |
| HTTP/PWA | Malformed or oversized JSON receives a structured error. Malformed percent encoding, external paths, and traversal cannot become manifest start URLs. |
| Shutdown | Consolidated signal handlers; close WebSockets and HTTP, clear periodic work, and force termination after a bounded drain. Unexpected fatal process errors now exit unsuccessfully for the process supervisor to restart. |
| Incoming encryption | Serialize message processing, including key import and metadata decryption. Update peer context synchronously on room updates. Missing keys and unreadable metadata fail closed. Ignore decryption results for cancelled transfers or replaced sockets. |
| Uploads | Empty files send one valid empty chunk. Check socket state after async file reads/encryption. Abort rejected/interrupted uploads and bound backpressure waits. Catch failed encryption/send operations. |
| Receiving files | Validate binary IDs/counts and final plaintext size. Store received chunks as Blob parts; release transfer state on failure, cancellation, completion, or disconnect. |
| Room lifecycle | Resolve pending create/join calls on errors/disconnect and after a timeout; guard overlapping operations. Preserve current membership if a destination room is full. Wait for a live connection before enabling room actions. |
| Local state | Merge loaded history with newly received clips, ignore stale loads, isolate state between room routes, normalize room IDs, validate restored/recent-room data, and close IndexedDB connections after transactions. |
| UI reliability | Completion labels expire once; toast timers and dialog focus no longer reset on unrelated renders. Lockout feedback is distinct from an incorrect password. CSS, assets, layouts, and normal interaction flows are unchanged. |
| Performance/configuration | Reuse the log date formatter; account for encrypted recipient fan-out when deciding to send large text as a file. Corrected the sample WebSocket payload limit from 3 MiB to 8 MiB. Removed a TypeScript 6 option incompatible with the installed TypeScript 4.9 compiler. |
| Packaging | Include the new server module in the existing deployment package. Update vulnerable runtime dependencies without major-version migrations. Express's `qs` constraint requires an explicit same-major security override. |

## Verification

- Backend syntax and frontend TypeScript checks.
- Production React build.
- Local HTTP/WebSocket smoke checks with isolated test configuration: Unicode relay, room isolation, invalid envelopes, file-ID collisions, chunk order, empty files, 4 MiB frames, disconnect cancellation, large-file authorization, malformed manifests, invalid HTTP JSON, lockout duration, and protected health access.
- Client service checks: real Web Crypto encryption/decryption, encrypted file assembly, empty-file upload/receive, missing-key failure, size mismatch cleanup, malformed frames, and failed metadata decryption.
- Runtime dependency advisory checks against npm's registry; see the final chat result for the final counts and build warnings.

The checks use disposable local harnesses in the ignored `.gemini-tmp` directory; no persistent test suite was added. Production, Raspberry Pi, and real browser/device sessions were not modified or exercised.

## Remaining architectural limits

- File transfers are live relays, not resumable downloads. Disconnects now fail explicitly; retry still requires resending the file. The existing IndexedDB chunk/checkpoint utility is not wired into the live receiver.
- Blob parts reduce retained JavaScript buffers but do not guarantee disk-backed storage. Very large files and simultaneous transfers can still exhaust browser/device resources. A disk-streaming receiver needs a separate compatibility design and device validation.
- Sender completion means chunks were queued to its socket, not that every recipient acknowledged receipt. End-to-end delivery acknowledgments require a protocol extension.
- Room codes grant access; rooms are not password protected. The upload password only authorizes large files. Public keys are exchanged through the relay without independent identity verification.
- Application limits are not distributed abuse protection. Multiple Node processes need shared room/rate state; proxy trust and edge connection/rate limits must match the actual deployment.
- Legacy JSON chunk messages remain accepted by the server but the current client only consumes binary file chunks, as before this refactor.
- No browser visual regression suite, mobile memory benchmark, or exhaustive build-tool dependency remediation was performed. Existing documentation claiming offline support or password-protected rooms should not be treated as an implementation guarantee.
