# SyncFlow

A polished real-time workspace where developers can write code together, chat, share files, manage tasks, and keep collaborative notes in one focused interface.

## Working features

- Room-based realtime collaboration with shareable invite links
- Monaco editor with live code synchronization
- Online presence and join/leave activity
- Realtime room chat, collaborative notes, and Kanban tasks
- Drag-and-drop file uploads with a 10 MB limit
- Responsive dark workspace and mobile layout
- Secure Judge0 integration point for code execution
- LiveKit-ready call controls with a clear configuration state

Room state currently lives in server memory and resets when the server restarts. Uploaded files use local storage. MongoDB/S3 persistence and full LiveKit calls are the next production milestones.

## Stack

- Frontend: React 18, TypeScript, Vite, Monaco Editor, Socket.IO Client, Lucide
- Backend: Node.js, Express, TypeScript, Socket.IO, Multer
- Monorepo: npm workspaces (`apps/web`, `apps/server`)

## Local setup

Requirements: Node.js 20+ and npm 9+.

```bash
git clone https://github.com/shashwatmauryabtech23-27-pixel/Syncflow.git
cd Syncflow
npm install
```

Copy the environment templates:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
```

On Windows PowerShell:

```powershell
Copy-Item apps/server/.env.example apps/server/.env
Copy-Item apps/web/.env.example apps/web/.env
```

Run frontend and backend together:

```bash
npm run dev
```

Open `http://localhost:5173`. The API runs at `http://localhost:4000`.

## Environment variables

Server (`apps/server/.env`):

```env
PORT=4000
CLIENT_URL=http://localhost:5173
JUDGE0_API_URL=
JUDGE0_API_KEY=
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

Web (`apps/web/.env`):

```env
VITE_API_URL=http://localhost:4000
```

Without Judge0 credentials, Run returns a clear setup message instead of executing untrusted code on the application server.

## Build and verify

```bash
npm run build
npm start
```

For deployment, host `apps/web/dist` as the frontend and run the root start command for the API. Set `VITE_API_URL` to the backend URL and `CLIENT_URL` to the frontend origin before building.

### Main endpoints

- `GET /api/health` — server health
- `GET /api/config` — external service availability
- `POST /api/run` — Judge0 code execution
- `POST /api/rooms/:roomId/files` — file upload
- Socket events — room state, code, chat, notes, tasks, files, and presence

Built by Shashwat Maurya.
