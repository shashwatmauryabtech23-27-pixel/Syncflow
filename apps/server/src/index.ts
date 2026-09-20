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
  roomId: { type: String, required: true, unique: true, index: true }, code: String, language: { type:String, default:'javascript' }, notes: String,
  mode: { type:String, enum:['team','teaching','interview'], default:'team' }, question:String, difficulty:String, diagram:String,
  activities: [{ id:String, text:String, time:Number, kind:String, code:String, user:String }],
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
type Activity = { id:string; text:string; time:number; kind:string; code?:string; user?:string };
type Room = { code: string; language:string; notes: string; mode:'team'|'teaching'|'interview'; question:string; difficulty:string; diagram:string; activities:Activity[]; users: Map<string, User>; tasks: Task[]; messages: Message[]; files: SharedFile[] };
type AuthRequest = Request & { user?: DecodedIdToken };
const rooms = new Map<string, Room>();
const colors = ['#8b5cf6', '#06b6d4', '#f97316', '#22c55e', '#ec4899'];
const initialRoom = (): Room => ({
  code: `// Welcome to SyncFlow\nfunction greet(name) {\n  return \`Hello, \${name}!\`;\n}\nconsole.log(greet('team'));`,
  language: 'javascript',
  mode:'team', question:'Build a correct and efficient solution. Explain your approach.', difficulty:'Medium', diagram:'Client → SyncFlow API → MongoDB\n        ↘ Code Runner', activities:[],
  notes: 'Add shared notes, decisions, and useful links here…', users: new Map(), messages: [], files: [],
  tasks: [{ id: crypto.randomUUID(), title: 'Plan the feature', status: 'todo' }, { id: crypto.randomUUID(), title: 'Build realtime workspace', status: 'progress' }, { id: crypto.randomUUID(), title: 'Ship the release', status: 'done' }]
});
const getRoom = async (roomId: string) => {
  if (rooms.has(roomId)) return rooms.get(roomId)!;
  const saved = mongoReady && mongoose.connection.readyState === 1 ? await RoomModel.findOne({ roomId }).lean() : null;
  const room: Room = saved ? { code: saved.code || '', language: saved.language || 'javascript', notes: saved.notes || '', mode:(saved.mode as Room['mode'])||'team', question:saved.question||'', difficulty:saved.difficulty||'Medium', diagram:saved.diagram||'', activities:(saved.activities||[]) as Activity[], tasks: saved.tasks as Task[], messages: saved.messages as Message[], files: saved.files as SharedFile[], users: new Map() } : initialRoom();
  rooms.set(roomId, room); return room;
};
const saveRoom = async (roomId: string, room: Room) => {
  if (mongoReady && mongoose.connection.readyState === 1) await RoomModel.updateOne({ roomId }, { $set: { code: room.code, language:room.language, notes: room.notes, mode:room.mode, question:room.question, difficulty:room.difficulty, diagram:room.diagram, activities:room.activities.slice(-100), tasks: room.tasks, messages: room.messages.slice(-100), files: room.files } }, { upsert: true });
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
const wandboxLanguages: Record<string, string> = { python:'Python', java:'Java', cpp:'C++', c:'C', csharp:'C#', go:'Go', rust:'Rust', php:'PHP', ruby:'Ruby', sql:'SQL' };
let wandboxCompilerCache: { expires:number; compilers:Array<{name:string;language:string}> } | null = null;
const runWithWandbox = async (code:string, language:string, signal:AbortSignal) => {
  const base=(process.env.WANDBOX_API_URL||'https://wandbox.org/api').replace(/\/$/,'');
  if(!wandboxLanguages[language]) throw new Error(`Wandbox does not support ${language}.`);
  if(!wandboxCompilerCache||wandboxCompilerCache.expires<Date.now()){
    const listResponse=await fetch(`${base}/list.json`,{signal});
    if(!listResponse.ok)throw new Error(`Wandbox compiler list returned HTTP ${listResponse.status}.`);
    wandboxCompilerCache={expires:Date.now()+10*60*1000,compilers:await listResponse.json() as Array<{name:string;language:string}>};
  }
  const expected=wandboxLanguages[language].toLowerCase();
  const candidates=wandboxCompilerCache.compilers.filter(item=>String(item.language).toLowerCase()===expected);
  const compiler=candidates.find(item=>!/head|snapshot|nightly/i.test(item.name))||candidates[0];
  if(!compiler)throw new Error(`No Wandbox compiler is currently available for ${wandboxLanguages[language]}.`);
  // Wandbox stores single-file Java submissions as prog.java and launches class prog.
  // Keep the editor's conventional `public class Main` template working by
  // adapting only the submitted copy; the user's source remains unchanged.
  const submittedCode=language==='java'
    ? code.replace(/public\s+class\s+Main\b/,'class prog').replace(/\bMain\s*\(/g,'prog(')
    : code;
  const response=await fetch(`${base}/compile.json`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:submittedCode,compiler:compiler.name,stdin:'',options:''}),signal});
  const result=await response.json() as Record<string,unknown>;
  if(!response.ok)throw new Error(String(result.message||`Wandbox returned HTTP ${response.status}.`));
  const status=String(result.status??'0');
  return { stdout:result.program_output||null,stderr:result.program_error||null,compile_output:result.compiler_error||result.compiler_output||null,message:null,status:{id:status==='0'?3:6,description:status==='0'?'Accepted':'Compilation or Runtime Error'},runner:'wandbox',compiler:compiler.name };
};

app.get('/api/health', (_req: Request, res: Response) => res.json({ success: true, message: 'SyncFlow API is running', database: mongoose.connection.readyState === 1, firebase: firebaseReady, uptime: process.uptime() }));
app.get('/api/config', (_req: Request, res: Response) => res.json({ firebase: firebaseReady, database: mongoose.connection.readyState === 1, judge0: Boolean(process.env.JUDGE0_API_URL), livekit: false }));
app.post('/api/auth/firebase', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = req.user!; const profile = { firebaseUid: user.uid, name: user.name || user.email?.split('@')[0] || 'User', email: user.email, photoURL: user.picture, lastLoginAt: new Date() };
  if (mongoReady && mongoose.connection.readyState === 1) await UserModel.updateOne({ firebaseUid: user.uid }, { $set: profile }, { upsert: true });
  res.json({ user: profile });
});
app.post('/api/rooms/:roomId/files', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ message: 'Choose a file to upload.' });
  const file = { id: req.file.filename, name: req.file.originalname, size: req.file.size, url: `/uploads/${req.file.filename}` };
  const roomId = String(req.params.roomId); const room = await getRoom(roomId); room.files.push(file); await saveRoom(roomId, room); io.to(roomId).emit('file:added', file); res.status(201).json(file);
});
app.post('/api/run', requireAuth, async (req: Request, res: Response) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const code=String(req.body.code||'').slice(0,200000);
  const language=String(req.body.language||'');
  try {
    if(!process.env.JUDGE0_API_URL)return res.json(await runWithWandbox(code,language,controller.signal));
    const rapidApiHeaders: Record<string, string> = {};
    if (process.env.JUDGE0_API_KEY) {
      rapidApiHeaders['X-RapidAPI-Key'] = process.env.JUDGE0_API_KEY;
      rapidApiHeaders['X-RapidAPI-Host'] = process.env.JUDGE0_API_HOST || 'judge0-ce.p.rapidapi.com';
    }
    const response = await fetch(`${process.env.JUDGE0_API_URL.replace(/\/$/, '')}/submissions?base64_encoded=false&wait=true`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...rapidApiHeaders },
      body: JSON.stringify({ source_code: code, language_id: Number(req.body.languageId || 63) }),
      signal: controller.signal
    });
    const result = await response.json();
    if (!response.ok) return res.json(await runWithWandbox(code,language,controller.signal));
    if(result.status?.id===13)return res.json(await runWithWandbox(code,language,controller.signal));
    res.json(result);
  }
  catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    if(!timedOut){
      try { return res.json(await runWithWandbox(code,language,controller.signal)); }
      catch(fallbackError){
        return res.status(502).json({ message: `Code execution services are unavailable. Judge0: ${error instanceof Error?error.message:'Unknown error'}. Wandbox: ${fallbackError instanceof Error?fallbackError.message:'Unknown error'}` });
      }
    }
    res.status(504).json({ message: 'Code execution timed out after 20 seconds.' });
  }
  finally { clearTimeout(timeout); }
});
app.post('/api/ai/debug', requireAuth, async (req: Request, res: Response) => {
  const code=String(req.body.code||'').slice(0,30000); const language=String(req.body.language||'text'); const output=String(req.body.output||'').slice(0,8000);
  const fallback=`Check the first error shown in the output, confirm the selected ${language} runtime, and isolate the smallest failing block. Add boundary and empty-input tests before changing the full solution.`;
  if(!process.env.GEMINI_API_KEY)return res.json({answer:fallback,provider:'local'});
  try{
    const model=process.env.GEMINI_MODEL||'gemini-2.5-flash';
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:`You are a concise code debugging assistant. Explain the cause, identify the likely line, provide a minimal corrected code block, and state time/space complexity.\nLanguage: ${language}\nOutput: ${output}\nCode:\n${code}`}]}],generationConfig:{temperature:.2,maxOutputTokens:1000}})});
    const data=await response.json() as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>};
    if(!response.ok)throw new Error('AI provider request failed');
    res.json({answer:data.candidates?.[0]?.content?.parts?.[0]?.text||fallback,provider:'gemini'});
  }catch{res.json({answer:fallback,provider:'local'});}
});

io.use(async (socket, next) => { try { socket.data.auth = await verifyToken(socket.handshake.auth.token); next(); } catch (error) { next(error instanceof Error ? error : new Error('Unauthorized')); } });
io.on('connection', socket => {
  socket.on('room:join', async ({ roomId }: { roomId: string }) => {
    const room = await getRoom(roomId); const auth = socket.data.auth as DecodedIdToken;
    const user = { id: socket.id, name: auth.name || auth.email?.split('@')[0] || 'User', color: colors[room.users.size % colors.length] };
    socket.join(roomId); socket.data.roomId = roomId; socket.data.user = user; room.users.set(socket.id, user);
    socket.emit('room:state', { code: room.code, language:room.language, notes: room.notes, mode:room.mode, question:room.question, difficulty:room.difficulty, diagram:room.diagram, activities:room.activities, tasks: room.tasks, messages: room.messages, files: room.files }); io.to(roomId).emit('presence:update', [...room.users.values()]);
  });
  socket.on('code:change', async ({ roomId, code, language }) => { const room = await getRoom(roomId); room.code = String(code).slice(0, 200000); if(language)room.language=String(language); socket.to(roomId).emit('code:update', {code:room.code,language:room.language}); await saveRoom(roomId, room); });
  socket.on('notes:change', async ({ roomId, notes }) => { const room = await getRoom(roomId); room.notes = String(notes).slice(0, 50000); socket.to(roomId).emit('notes:update', room.notes); await saveRoom(roomId, room); });
  socket.on('chat:send', async ({ roomId, text }) => { const room = await getRoom(roomId); const clean = String(text || '').trim().slice(0, 500); if (!clean) return; const message = { id: crypto.randomUUID(), user: socket.data.user, text: clean, time: Date.now() }; room.messages = [...room.messages.slice(-99), message]; io.to(roomId).emit('chat:message', message); await saveRoom(roomId, room); });
  socket.on('tasks:update', async ({ roomId, tasks }) => { const room = await getRoom(roomId); room.tasks = Array.isArray(tasks) ? tasks.slice(0, 100) : room.tasks; socket.to(roomId).emit('tasks:update', room.tasks); await saveRoom(roomId, room); });
  socket.on('workspace:settings',async({roomId,settings})=>{const room=await getRoom(roomId);if(['team','teaching','interview'].includes(settings?.mode))room.mode=settings.mode;if(typeof settings?.question==='string')room.question=settings.question.slice(0,5000);if(['Easy','Medium','Hard'].includes(settings?.difficulty))room.difficulty=settings.difficulty;if(typeof settings?.diagram==='string')room.diagram=settings.diagram.slice(0,20000);socket.to(roomId).emit('workspace:settings',settings);await saveRoom(roomId,room)});
  socket.on('activity:add',async({roomId,activity})=>{const room=await getRoom(roomId);const clean={id:String(activity?.id||crypto.randomUUID()),text:String(activity?.text||'Activity').slice(0,300),time:Number(activity?.time||Date.now()),kind:String(activity?.kind||'room'),code:activity?.code?String(activity.code).slice(0,200000):undefined,user:String(activity?.user||socket.data.user?.name||'User').slice(0,80)};room.activities=[...room.activities.slice(-99),clean];socket.to(roomId).emit('activity:added',clean);await saveRoom(roomId,room)});
  socket.on('signal', ({ target, data }) => io.to(target).emit('signal', { from: socket.id, data }));
  socket.on('disconnect', () => { const room = rooms.get(socket.data.roomId); if (!room) return; room.users.delete(socket.id); io.to(socket.data.roomId).emit('peer:left',{id:socket.id}); io.to(socket.data.roomId).emit('presence:update', [...room.users.values()]); });
});
server.listen(port, () => console.log(`SyncFlow server running at http://localhost:${port}`));
