# SyncFlow - Real-Time Collaborative Developer Workspace

SyncFlow is an end-to-end full-stack collaborative platform where developers can join virtual rooms, code together in real time using Monaco Editor and CRDT-powered Yjs, execute code inside isolated sandboxes (Judge0), communicate via multi-user HD audio/video calls and screen sharing (LiveKit), drag and drop shared files, organize Kanban task boards, and jot down collaborative notes.

---

## Architecture Overview

- **Monorepo Layout**:
  - `apps/web`: React 18, Vite, TypeScript, Tailwind CSS, Monaco Editor, Yjs, LiveKit Client SDK, Socket.IO client.
  - `apps/server`: Node.js, Express, TypeScript, Socket.IO server, Yjs WebSocket provider, MongoDB/Mongoose (with zero-setup in-memory dev fallback), LiveKit Server SDK token generation, Judge0 REST execution client, S3/local file storage provider.
  - `packages/shared`: Shared TypeScript types, RBAC permission matrices, language templates, and constants.
- **Real-Time Synchronization**:
  - Code document synchronization via CRDTs (Yjs + y-monaco + y-websocket) with remote colored cursors and awareness.
  - Workspace state, chat, presence, Kanban board, and room moderation events via Socket.IO.
- **Isolated Code Execution**:
  - Untrusted code is never executed via host `eval` or shell. All runs route through a secure Judge0 sandbox with CPU and memory limits.

---

## Windows Quickstart (PowerShell)

### 1. Prerequisites
- **Node.js**: v18 or higher (v20+ recommended)
- **npm**: v9 or higher

### 2. Installation
Open PowerShell in the `syncflow` directory:
```powershell
cd "C:\Users\Shashwat Maurya\.gemini\antigravity\scratch\syncflow"
npm install
```

### 3. Environment Setup
The server and web applications include sample environment files:
- `apps/server/.env.example`
- `apps/server/.env` (pre-configured for zero-setup local dev with in-memory MongoDB)
- `apps/web/.env.example`
- `apps/web/.env`

### 4. Build Shared Types
```powershell
npm run build:shared
```

### 5. Running the Application
To run both backend and frontend concurrently:
```powershell
# In terminal 1 (Backend Server on port 4000):
npm run dev:server

# In terminal 2 (Frontend on port 5173):
npm run dev:web
```

Open your browser at [http://localhost:5173](http://localhost:5173).

---

## External Services Configuration

SyncFlow cleanly distinguishes working local features from features requiring third-party credentials:

### 1. Database (MongoDB)
- **Zero-Setup Default**: If `MONGODB_URI` is left as `memory` or empty in development mode, SyncFlow automatically spins up an in-memory MongoDB instance via `mongodb-memory-server`.
- **Production**: Set `MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/syncflow`.

### 2. Isolated Code Execution (Judge0)
To enable live sandbox execution for JavaScript, Python, Java, and C++:
- **RapidAPI Judge0**:
  ```env
  JUDGE0_API_URL=https://judge0-ce.p.rapidapi.com
  JUDGE0_API_KEY=your_rapidapi_key
  JUDGE0_IS_RAPIDAPI=true
  ```
- **Self-Hosted Judge0 (Docker)**:
  ```env
  JUDGE0_API_URL=http://localhost:2358
  JUDGE0_IS_RAPIDAPI=false
  ```
*Note: If unconfigured, the UI clearly displays "Code Execution Service Not Configured" and preserves all other workspace features.*

### 3. Video / Audio Calling & Screen Sharing (LiveKit)
To enable WebRTC multi-user video and screen sharing:
1. Create a free project at [LiveKit Cloud](https://cloud.livekit.io).
2. Set the credentials in `apps/server/.env`:
   ```env
   LIVEKIT_URL=wss://your-project.livekit.cloud
   LIVEKIT_API_KEY=your_api_key
   LIVEKIT_API_SECRET=your_api_secret
   ```
*Note: If unconfigured, the UI displays an honest "LiveKit Service Not Configured" helper without failing or simulating fake video loops.*

### 4. File Storage (AWS S3 / MinIO / R2)
- If `AWS_S3_BUCKET` is configured, presigned URLs are used.
- If unconfigured, SyncFlow automatically falls back to an authenticated local storage directory (`apps/server/uploads/`) with streaming endpoints.

---

## Role-Based Access Control (RBAC) Matrix

| Feature / Action | Host | Editor | Viewer |
| :--- | :---: | :---: | :---: |
| View Code & File Tree | Yes | Yes | Yes |
| Edit Code in Monaco (Yjs) | Yes | Yes | Read-Only |
| Execute Code (Sandbox) | Yes | Yes | Forbidden (403) |
| Create / Rename / Move Files | Yes | Yes | Forbidden |
| Upload File Attachments | Yes | Yes | Forbidden |
| Delete Own Attachments | Yes | Yes | Forbidden |
| Delete Other Users' Attachments | Yes | Forbidden | Forbidden |
| Chat, Emoji Reactions & Notes | Yes | Yes | Yes |
| Create / Move Tasks | Yes | Yes | Yes |
| Take Workspace Snapshot | Yes | Yes | Forbidden |
| Restore Workspace to Snapshot | Yes | Forbidden | Forbidden |
| Lock Room / Moderate Waiting Room | Yes | Forbidden | Forbidden |
| Kick Participant / Change Roles | Yes | Forbidden | Forbidden |

---

## Running Automated Tests

```powershell
npm run test
```
Runs the Jest test suite covering RBAC permissions, password hashing, JWT authentication, and Judge0 isolation.
