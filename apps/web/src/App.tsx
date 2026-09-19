import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { io, Socket } from 'socket.io-client';
import { Braces, CheckCircle2, Clipboard, Code2, FilePlus2, Files, Hash, KanbanSquare, MessageSquare, Mic, MicOff, MonitorUp, NotebookPen, Play, Plus, Send, Settings, Sparkles, Users, Video, VideoOff, Wifi, X } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
type User = { id: string; name: string; color: string };
type Message = { id: string; text: string; time: number; system?: boolean; user?: User };
type Task = { id: string; title: string; status: 'todo' | 'progress' | 'done' };
type SharedFile = { id: string; name: string; size: number; url: string };
const roomFromUrl = new URLSearchParams(location.search).get('room') || 'team-alpha';

export default function App() {
  const [joined, setJoined] = useState(false);
  const [name, setName] = useState(localStorage.getItem('syncflow:name') || 'Shashwat');
  const [roomId, setRoomId] = useState(roomFromUrl);
  const [code, setCode] = useState('');
  const [notes, setNotes] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [panel, setPanel] = useState<'chat' | 'tasks' | 'notes'>('chat');
  const [message, setMessage] = useState('');
  const [output, setOutput] = useState('Ready. Click Run to execute your code.');
  const [connected, setConnected] = useState(false);
  const [mic, setMic] = useState(true);
  const [video, setVideo] = useState(false);
  const [copied, setCopied] = useState(false);
  const socket = useRef<Socket | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { socket.current?.disconnect(); }, []);
  const join = () => {
    if (!name.trim() || !roomId.trim()) return;
    localStorage.setItem('syncflow:name', name);
    history.replaceState(null, '', `?room=${encodeURIComponent(roomId)}`);
    const s = io(API);
    socket.current = s;
    s.on('connect', () => { setConnected(true); s.emit('room:join', { roomId, name }); });
    s.on('disconnect', () => setConnected(false));
    s.on('room:state', state => { setCode(state.code); setNotes(state.notes); setTasks(state.tasks); });
    s.on('presence:update', setUsers);
    s.on('code:update', setCode);
    s.on('notes:update', setNotes);
    s.on('tasks:update', setTasks);
    s.on('chat:message', (m: Message) => setMessages(x => [...x.slice(-80), m]));
    s.on('file:added', (f: SharedFile) => setFiles(x => x.some(v => v.id === f.id) ? x : [...x, f]));
    setJoined(true);
  };
  const send = () => { if (message.trim()) socket.current?.emit('chat:send', { roomId, text: message }); setMessage(''); };
  const updateTasks = (next: Task[]) => { setTasks(next); socket.current?.emit('tasks:update', { roomId, tasks: next }); };
  const addTask = () => { const title = prompt('Task name'); if (title?.trim()) updateTasks([...tasks, { id: crypto.randomUUID(), title: title.trim(), status: 'todo' }]); };
  const moveTask = (id: string) => updateTasks(tasks.map(t => t.id === id ? { ...t, status: t.status === 'todo' ? 'progress' : t.status === 'progress' ? 'done' : 'todo' } : t));
  const upload = async (file?: File) => {
    if (!file) return;
    const data = new FormData(); data.append('file', file);
    const res = await fetch(`${API}/api/rooms/${roomId}/files`, { method: 'POST', body: data });
    if (!res.ok) alert((await res.json()).message || 'Upload failed');
  };
  const run = async () => {
    setOutput('Running securely…');
    const res = await fetch(`${API}/api/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, languageId: 63 }) });
    const data = await res.json(); setOutput(data.stdout || data.stderr || data.compile_output || data.message || 'Program finished without output.');
  };
  const copyInvite = async () => { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); };

  if (!joined) return <Join name={name} setName={setName} roomId={roomId} setRoomId={setRoomId} join={join} />;
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Braces size={20}/></div><span>Sync<span>Flow</span></span></div>
      <div className="room-meta"><span className="status-dot"/><div><small>WORKSPACE</small><strong>{roomId}</strong></div><button className="icon-btn" onClick={copyInvite} title="Copy room link">{copied ? <CheckCircle2 size={17}/> : <Clipboard size={17}/>}</button></div>
      <div className="top-actions"><div className={`connection ${connected ? '' : 'offline'}`}><Wifi size={14}/>{connected ? 'Live' : 'Reconnecting'}</div><div className="avatar-stack">{users.slice(0,4).map(u => <span key={u.id} style={{background:u.color}} title={u.name}>{u.name[0]?.toUpperCase()}</span>)}</div><button className="invite-btn" onClick={copyInvite}><Users size={16}/> Invite</button><button className="icon-btn"><Settings size={18}/></button></div>
    </header>
    <main className="workspace">
      <aside className="activity-bar">
        <button className="active" title="Code"><Code2/></button><button title="Files" onClick={() => uploadRef.current?.click()}><Files/></button><button title="Chat" onClick={() => setPanel('chat')}><MessageSquare/></button><button title="Tasks" onClick={() => setPanel('tasks')}><KanbanSquare/></button><button title="Notes" onClick={() => setPanel('notes')}><NotebookPen/></button><div className="spacer"/><span className="mini-avatar">{name[0]?.toUpperCase()}</span>
      </aside>
      <section className="file-panel" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();upload(e.dataTransfer.files[0])}}>
        <div className="panel-title"><span>EXPLORER</span><button onClick={() => uploadRef.current?.click()}><FilePlus2 size={15}/></button></div>
        <div className="folder"><span>⌄</span> SYNCFLOW</div>
        <div className="file active"><span className="js-icon">JS</span> index.js</div>
        {files.map(f => <a className="file" href={`${API}${f.url}`} target="_blank" key={f.id}><span className="generic-icon">•</span>{f.name}</a>)}
        <button className="dropzone" onClick={() => uploadRef.current?.click()}><FilePlus2 size={19}/><span>Drop files here</span><small>Up to 10 MB</small></button>
        <input hidden type="file" ref={uploadRef} onChange={e=>upload(e.target.files?.[0])}/>
      </section>
      <section className="editor-area">
        <div className="editor-tabs"><div className="editor-tab active"><span className="js-icon">JS</span>index.js <X size={13}/></div><button className="new-tab"><Plus size={15}/></button><div className="editor-actions"><select aria-label="Language"><option>JavaScript</option></select><button className="run-btn" onClick={run}><Play size={15} fill="currentColor"/> Run</button></div></div>
        <div className="breadcrumbs">syncflow <span>›</span> index.js <span>›</span> <Code2 size={13}/> editor</div>
        <div className="editor-wrap"><Editor height="100%" language="javascript" theme="vs-dark" value={code} onChange={v=>{const next=v||'';setCode(next);socket.current?.emit('code:change',{roomId,code:next})}} options={{fontSize:14,fontFamily:"'JetBrains Mono', monospace",minimap:{enabled:false},padding:{top:18},scrollBeyondLastLine:false,renderLineHighlight:'all',automaticLayout:true}}/></div>
        <div className="terminal"><div className="terminal-head"><span>OUTPUT</span><button onClick={()=>setOutput('')}>CLEAR</button></div><pre>{output}</pre></div>
      </section>
      <aside className="collab-panel">
        <div className="collab-tabs"><button className={panel==='chat'?'active':''} onClick={()=>setPanel('chat')}><MessageSquare size={16}/>Chat</button><button className={panel==='tasks'?'active':''} onClick={()=>setPanel('tasks')}><KanbanSquare size={16}/>Tasks</button><button className={panel==='notes'?'active':''} onClick={()=>setPanel('notes')}><NotebookPen size={16}/>Notes</button></div>
        {panel === 'chat' && <><div className="channel"><Hash size={15}/>general <span>{users.length} online</span></div><div className="messages">{messages.map(m => m.system ? <div className="system-msg" key={m.id}>{m.text}</div> : <div className="message" key={m.id}><span className="message-avatar" style={{background:m.user?.color}}>{m.user?.name[0]}</span><div><strong>{m.user?.name}<time>{new Date(m.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></strong><p>{m.text}</p></div></div>)}</div><div className="composer"><input value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Message #general"/><button onClick={send}><Send size={16}/></button></div></>}
        {panel === 'tasks' && <div className="tasks"><div className="tasks-head"><div><strong>Team tasks</strong><small>Click a task to move it forward</small></div><button onClick={addTask}><Plus size={16}/></button></div>{(['todo','progress','done'] as const).map(status=><div className="task-group" key={status}><label>{status==='todo'?'TO DO':status==='progress'?'IN PROGRESS':'DONE'} <span>{tasks.filter(t=>t.status===status).length}</span></label>{tasks.filter(t=>t.status===status).map(t=><button className="task" onClick={()=>moveTask(t.id)} key={t.id}><span className={`task-dot ${status}`}/>{t.title}</button>)}</div>)}</div>}
        {panel === 'notes' && <div className="notes"><div><Sparkles size={18}/><strong>Shared notes</strong></div><textarea value={notes} onChange={e=>{setNotes(e.target.value);socket.current?.emit('notes:change',{roomId,notes:e.target.value})}}/></div>}
      </aside>
    </main>
    <footer className="callbar"><div className="call-info"><span className="pulse"/><div><strong>Team huddle</strong><small>{users.length} participant{users.length!==1?'s':''}</small></div></div><div className="call-actions"><button className={!mic?'danger':''} onClick={()=>setMic(!mic)}>{mic?<Mic/>:<MicOff/>}</button><button className={video?'active':''} onClick={()=>setVideo(!video)}>{video?<Video/>:<VideoOff/>}</button><button onClick={()=>alert('Screen sharing requires LiveKit credentials. Add them in apps/server/.env.')}><MonitorUp/></button></div><div className="call-note">Configure LiveKit for calls</div></footer>
  </div>;
}

function Join({name,setName,roomId,setRoomId,join}:{name:string;setName:(v:string)=>void;roomId:string;setRoomId:(v:string)=>void;join:()=>void}) {
  return <div className="join-page"><div className="ambient a1"/><div className="ambient a2"/><nav><div className="brand"><div className="brand-mark"><Braces size={22}/></div><span>Sync<span>Flow</span></span></div><span className="nav-note"><span className="status-dot"/> Real-time developer workspace</span></nav><div className="join-grid"><section className="hero"><div className="eyebrow"><Sparkles size={15}/> Built for teams that ship</div><h1>Build together.<br/><span>Flow faster.</span></h1><p>One focused workspace for collaborative coding, team chat, shared files, tasks and calls—beautifully in sync.</p><div className="feature-row"><span><Code2/>Live code</span><span><Video/>Team calls</span><span><Files/>File sharing</span></div></section><section className="join-card"><div className="card-icon"><Users/></div><h2>Enter your workspace</h2><p>Join a room and start collaborating instantly.</p><label>Your name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Enter your name"/></label><label>Room ID<div className="room-input"><Hash size={18}/><input value={roomId} onChange={e=>setRoomId(e.target.value.replace(/\s/g,'-').toLowerCase())} onKeyDown={e=>e.key==='Enter'&&join()} placeholder="team-alpha"/></div></label><button className="join-btn" onClick={join}>Join workspace <span>→</span></button><small className="privacy">No account required · Your room stays private</small></section></div><footer className="landing-footer">© 2026 SyncFlow <span>Made for people who build together.</span></footer></div>;
}
