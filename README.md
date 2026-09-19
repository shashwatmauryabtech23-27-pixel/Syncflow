# SyncFlow

A polished real-time workspace where developers can write code together, chat, share files, manage tasks, and keep collaborative notes in one focused interface.

## Working features

- Room-based realtime collaboration with shareable invite links
- Google sign-in with Firebase Authentication and backend ID-token verification
- MongoDB persistence for users, room code, chat, notes, tasks, and file metadata
- Monaco editor with live code synchronization
- Online presence and join/leave activity
- Realtime room chat, collaborative notes, and Kanban tasks
- Drag-and-drop file uploads with a 10 MB limit
- Responsive dark workspace and mobile layout
- Secure Judge0 integration point for code execution
- LiveKit-ready call controls with a clear configuration state

When MongoDB is configured, collaborative room state persists across server restarts. Uploaded file bytes still use local storage; use a persistent disk or object storage in production. Audio/video calling remains a separate production milestone.

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
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER/syncflow
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
JUDGE0_API_URL=
JUDGE0_API_KEY=
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

Web (`apps/web/.env`):

```env
VITE_API_URL=http://localhost:4000
VITE_FIREBASE_API_KEY=your-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

In Firebase Console, enable **Authentication → Sign-in method → Google** and add your local/deployed frontend domains under **Authorized domains**. Download a Firebase Admin service-account key and copy its three values into the server environment. Never commit the real `.env` files.

JavaScript runs inside a short-lived browser Web Worker, so it works without Judge0 credentials. Judge0 can still be configured later for additional languages.

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
