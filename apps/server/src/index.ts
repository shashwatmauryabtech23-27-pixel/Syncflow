import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import mongoose from 'mongoose';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { Server } from 'socket.io';
import dns from "node:dns";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const port = Number(process.env.PORT || 4000);
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const firebaseReady = Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
const mongoReady = Boolean(process.env.MONGODB_URI);

if (firebaseReady && !getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n')
}) });

const UserModel = mongoose.model('User', new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true }, email: String, photoURL: String, lastLoginAt: Date
}, { timestamps: true }));
const RoomModel = mongoose.model('Room', new mongoose.Schema({
  roomId: { type: String, required: true, unique: true, index: true }, code: String, notes: String,
  tasks: [{ id: String, title: String, status: { type: String, enum: ['todo', 'progress', 'done'] } }],
  messages: [{ id: String, text: String, time: Number, system: Boolean, user: { id: String, name: String, color: String } }],
  files: [{ id: String, name: String, size: Number, url: String }]
}, { timestamps: true }));

if (mongoReady) mongoose.connect(process.env.MONGODB_URI!).then(() => console.log('MongoDB connected')).catch(error => console.error('MongoDB connection failed:', error.message));
else console.warn('MONGODB_URI is missing; room data will use memory only.');

type User = { id: string; name: string; color: string };
type Task = { id: string; title: string; status: 'todo' | 'progress' | 'done' };
type Message = { id: string; text: string; time: number; system?: boolean; user?: User };
type SharedFile = { id: string; name: string; size: number; url: string };
type Room = { code: string; notes: string; users: Map<string, User>; tasks: Task[]; messages: Message[]; files: SharedFile[] };
type AuthRequest = Request & { user?: DecodedIdToken };
const rooms = new Map<string, Room>();
const colors = ['#8b5cf6', '#06b6d4', '#f97316', '#22c55e', '#ec4899'];
const initialRoom = (): Room => ({
  code: `// Welcome to SyncFlow\nfunction greet(name) {\n  return \`Hello, \${name}!\`;\n}\nconsole.log(greet('team'));`,
  notes: 'Add shared notes, decisions, and useful links here…', users: new Map(), messages: [], files: [],
  tasks: [{ id: crypto.randomUUID(), title: 'Plan the feature', status: 'todo' }, { id: crypto.randomUUID(), title: 'Build realtime workspace', status: 'progress' }, { id: crypto.randomUUID(), title: 'Ship the release', status: 'done' }]
});
const getRoom = async (roomId: string) => {
  if (rooms.has(roomId)) return rooms.get(roomId)!;
  const saved = mongoReady && mongoose.connection.readyState === 1 ? await RoomModel.findOne({ roomId }).lean() : null;
  const room: Room = saved ? { code: saved.code || '', notes: saved.notes || '', tasks: saved.tasks as Task[], messages: saved.messages as Message[], files: saved.files as SharedFile[], users: new Map() } : initialRoom();
  rooms.set(roomId, room); return room;
};
const saveRoom = async (roomId: string, room: Room) => {
  if (mongoReady && mongoose.connection.readyState === 1) await RoomModel.updateOne({ roomId }, { $set: { code: room.code, notes: room.notes, tasks: room.tasks, messages: room.messages.slice(-100), files: room.files } }, { upsert: true });
};
const verifyToken = async (token?: string) => {
  if (!firebaseReady) throw new Error('Firebase Admin is not configured');
  if (!token) throw new Error('Missing Firebase ID token');
  return getAuth().verifyIdToken(token);
};
const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { req.user = await verifyToken(req.headers.authorization?.replace(/^Bearer\s+/i, '')); next(); }
  catch (error) { res.status(401).json({ message: error instanceof Error ? error.message : 'Unauthorized' }); }
};

const app = express(); const server = createServer(app);
const io = new Server(server, { cors: { origin: clientUrl, methods: ['GET', 'POST'] } });
app.use(cors({ origin: clientUrl })); app.use(express.json({ limit: '1mb' }));
mkdirSync('uploads', { recursive: true }); app.use('/uploads', express.static('uploads'));
const upload = multer({ dest: 'uploads/', limits: { fileSize: 10 * 1024 * 1024 } });

app.get('/api/health', (_req, res) => res.json({ success: true, message: 'SyncFlow API is running', database: mongoose.connection.readyState === 1, firebase: firebaseReady, uptime: process.uptime() }));
app.get('/api/config', (_req, res) => res.json({ firebase: firebaseReady, database: mongoose.connection.readyState === 1, judge0: Boolean(process.env.JUDGE0_API_URL), livekit: false }));
app.post('/api/auth/firebase', requireAuth, async (req: AuthRequest, res) => {
  const user = req.user!; const profile = { firebaseUid: user.uid, name: user.name || user.email?.split('@')[0] || 'User', email: user.email, photoURL: user.picture, lastLoginAt: new Date() };
  if (mongoReady && mongoose.connection.readyState === 1) await UserModel.updateOne({ firebaseUid: user.uid }, { $set: profile }, { upsert: true });
  res.json({ user: profile });
});
app.post('/api/rooms/:roomId/files', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Choose a file to upload.' });
  const file = { id: req.file.filename, name: req.file.originalname, size: req.file.size, url: `/uploads/${req.file.filename}` };
  const roomId = String(req.params.roomId); const room = await getRoom(roomId); room.files.push(file); await saveRoom(roomId, room); io.to(roomId).emit('file:added', file); res.status(201).json(file);
});
app.post('/api/run', requireAuth, async (req, res) => {
  if (!process.env.JUDGE0_API_URL) return res.status(503).json({ message: 'Judge0 is not configured. JavaScript can run locally in the browser.' });
  try { const response = await fetch(`${process.env.JUDGE0_API_URL}/submissions?base64_encoded=false&wait=true`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.JUDGE0_API_KEY ? { 'X-RapidAPI-Key': process.env.JUDGE0_API_KEY } : {}) }, body: JSON.stringify({ source_code: req.body.code, language_id: req.body.languageId || 63 }) }); res.status(response.status).json(await response.json()); }
  catch { res.status(502).json({ message: 'Code execution service is unavailable.' }); }
});

io.use(async (socket, next) => { try { socket.data.auth = await verifyToken(socket.handshake.auth.token); next(); } catch (error) { next(error instanceof Error ? error : new Error('Unauthorized')); } });
io.on('connection', socket => {
  socket.on('room:join', async ({ roomId }: { roomId: string }) => {
    const room = await getRoom(roomId); const auth = socket.data.auth as DecodedIdToken;
    const user = { id: socket.id, name: auth.name || auth.email?.split('@')[0] || 'User', color: colors[room.users.size % colors.length] };
    socket.join(roomId); socket.data.roomId = roomId; socket.data.user = user; room.users.set(socket.id, user);
    socket.emit('room:state', { code: room.code, notes: room.notes, tasks: room.tasks, messages: room.messages, files: room.files }); io.to(roomId).emit('presence:update', [...room.users.values()]);
  });
  socket.on('code:change', async ({ roomId, code }) => { const room = await getRoom(roomId); room.code = String(code).slice(0, 200000); socket.to(roomId).emit('code:update', room.code); await saveRoom(roomId, room); });
  socket.on('notes:change', async ({ roomId, notes }) => { const room = await getRoom(roomId); room.notes = String(notes).slice(0, 50000); socket.to(roomId).emit('notes:update', room.notes); await saveRoom(roomId, room); });
  socket.on('chat:send', async ({ roomId, text }) => { const room = await getRoom(roomId); const clean = String(text || '').trim().slice(0, 500); if (!clean) return; const message = { id: crypto.randomUUID(), user: socket.data.user, text: clean, time: Date.now() }; room.messages = [...room.messages.slice(-99), message]; io.to(roomId).emit('chat:message', message); await saveRoom(roomId, room); });
  socket.on('tasks:update', async ({ roomId, tasks }) => { const room = await getRoom(roomId); room.tasks = Array.isArray(tasks) ? tasks.slice(0, 100) : room.tasks; socket.to(roomId).emit('tasks:update', room.tasks); await saveRoom(roomId, room); });
  socket.on('signal', ({ target, data }) => io.to(target).emit('signal', { from: socket.id, data }));
  socket.on('disconnect', () => { const room = rooms.get(socket.data.roomId); if (!room) return; room.users.delete(socket.id); io.to(socket.data.roomId).emit('presence:update', [...room.users.values()]); });
});
server.listen(port, () => console.log(`SyncFlow server running at http://localhost:${port}`));
