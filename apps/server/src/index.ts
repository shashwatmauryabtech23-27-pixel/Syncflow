import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { Server } from 'socket.io';

const port = Number(process.env.PORT || 4000);
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: clientUrl, methods: ['GET', 'POST'] } });

app.use(cors({ origin: clientUrl }));
app.use(express.json({ limit: '1mb' }));
mkdirSync('uploads', { recursive: true });
app.use('/uploads', express.static('uploads'));
const upload = multer({ dest: 'uploads/', limits: { fileSize: 10 * 1024 * 1024 } });

type User = { id: string; name: string; color: string };
type Task = { id: string; title: string; status: 'todo' | 'progress' | 'done' };
type Room = { code: string; notes: string; users: Map<string, User>; tasks: Task[] };
const rooms = new Map<string, Room>();
const colors = ['#8b5cf6', '#06b6d4', '#f97316', '#22c55e', '#ec4899'];
const getRoom = (id: string) => {
  if (!rooms.has(id)) rooms.set(id, {
    code: `// Welcome to SyncFlow\n// Start building something amazing together.\n\nfunction greet(name) {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet('team'));`,
    notes: 'Add shared notes, decisions, and useful links here…',
    users: new Map(),
    tasks: [
      { id: crypto.randomUUID(), title: 'Plan the feature', status: 'todo' },
      { id: crypto.randomUUID(), title: 'Build realtime workspace', status: 'progress' },
      { id: crypto.randomUUID(), title: 'Ship the release', status: 'done' }
    ]
  });
  return rooms.get(id)!;
};

app.get('/api/health', (_req, res) => res.json({ success: true, message: 'SyncFlow API is running', uptime: process.uptime() }));
app.get('/api/config', (_req, res) => res.json({
  judge0: Boolean(process.env.JUDGE0_API_URL),
  livekit: Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET)
}));
app.post('/api/rooms/:roomId/files', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Choose a file to upload.' });
  const file = { id: req.file.filename, name: req.file.originalname, size: req.file.size, url: `/uploads/${req.file.filename}` };
  io.to(req.params.roomId).emit('file:added', file);
  res.status(201).json(file);
});
app.post('/api/run', async (req, res) => {
  if (!process.env.JUDGE0_API_URL) return res.status(503).json({ message: 'Judge0 is not configured yet. Add JUDGE0_API_URL in apps/server/.env.' });
  try {
    const response = await fetch(`${process.env.JUDGE0_API_URL}/submissions?base64_encoded=false&wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.JUDGE0_API_KEY ? { 'X-RapidAPI-Key': process.env.JUDGE0_API_KEY } : {}) },
      body: JSON.stringify({ source_code: req.body.code, language_id: req.body.languageId || 63 })
    });
    res.status(response.status).json(await response.json());
  } catch { res.status(502).json({ message: 'Code execution service is unavailable.' }); }
});

io.on('connection', socket => {
  socket.on('room:join', ({ roomId, name }: { roomId: string; name: string }) => {
    const room = getRoom(roomId);
    const user = { id: socket.id, name: name.trim().slice(0, 30) || 'Guest', color: colors[room.users.size % colors.length] };
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.user = user;
    room.users.set(socket.id, user);
    socket.emit('room:state', { code: room.code, notes: room.notes, tasks: room.tasks });
    io.to(roomId).emit('presence:update', [...room.users.values()]);
    io.to(roomId).emit('chat:message', { id: crypto.randomUUID(), system: true, text: `${user.name} joined the room`, time: Date.now() });
  });
  socket.on('code:change', ({ roomId, code }) => { getRoom(roomId).code = code; socket.to(roomId).emit('code:update', code); });
  socket.on('notes:change', ({ roomId, notes }) => { getRoom(roomId).notes = notes; socket.to(roomId).emit('notes:update', notes); });
  socket.on('chat:send', ({ roomId, text }) => {
    const clean = String(text || '').trim().slice(0, 500);
    if (clean) io.to(roomId).emit('chat:message', { id: crypto.randomUUID(), user: socket.data.user, text: clean, time: Date.now() });
  });
  socket.on('tasks:update', ({ roomId, tasks }) => { getRoom(roomId).tasks = tasks; socket.to(roomId).emit('tasks:update', tasks); });
  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;
    const user = room.users.get(socket.id);
    room.users.delete(socket.id);
    io.to(socket.data.roomId).emit('presence:update', [...room.users.values()]);
    if (user) io.to(socket.data.roomId).emit('chat:message', { id: crypto.randomUUID(), system: true, text: `${user.name} left the room`, time: Date.now() });
  });
});

server.listen(port, () => console.log(`SyncFlow server running at http://localhost:${port}`));
