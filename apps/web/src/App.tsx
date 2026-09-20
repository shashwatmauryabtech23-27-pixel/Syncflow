import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { io, Socket } from 'socket.io-client';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { auth, firebaseConfigured, loginWithGoogle, logout } from './firebase';
import { Braces, CheckCircle2, Clipboard, Code2, FilePlus2, Files, Hash, KanbanSquare, MessageSquare, Mic, MicOff, MonitorUp, NotebookPen, Play, Plus, Send, Settings, Sparkles, Users, Video, VideoOff, Volume2, VolumeX, Wifi, X } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
type User = { id: string; name: string; color: string };
type Message = { id: string; text: string; time: number; system?: boolean; user?: User };
type Task = { id: string; title: string; status: 'todo' | 'progress' | 'done' };
type SharedFile = { id: string; name: string; size: number; url: string };
type Language = { label:string; monaco:string; ext:string; id?:number; starter:string };
const languages:Record<string,Language> = {
  javascript:{label:'JavaScript',monaco:'javascript',ext:'js',id:63,starter:"console.log('Hello, SyncFlow!');"},
  typescript:{label:'TypeScript',monaco:'typescript',ext:'ts',id:74,starter:"const message: string = 'Hello, SyncFlow!';\nconsole.log(message);"},
  python:{label:'Python',monaco:'python',ext:'py',id:71,starter:"print('Hello, SyncFlow!')"},
  java:{label:'Java',monaco:'java',ext:'java',id:62,starter:'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, SyncFlow!");\n  }\n}'},
  cpp:{label:'C++',monaco:'cpp',ext:'cpp',id:54,starter:'#include <iostream>\nusing namespace std;\nint main(){ cout << "Hello, SyncFlow!"; }'},
  c:{label:'C',monaco:'c',ext:'c',id:50,starter:'#include <stdio.h>\nint main(){ printf("Hello, SyncFlow!\\n"); }'},
  csharp:{label:'C#',monaco:'csharp',ext:'cs',id:51,starter:'using System;\nclass Program { static void Main(){ Console.WriteLine("Hello, SyncFlow!"); } }'},
  go:{label:'Go',monaco:'go',ext:'go',id:60,starter:'package main\nimport "fmt"\nfunc main(){ fmt.Println("Hello, SyncFlow!") }'},
  rust:{label:'Rust',monaco:'rust',ext:'rs',id:73,starter:'fn main(){ println!("Hello, SyncFlow!"); }'},
  php:{label:'PHP',monaco:'php',ext:'php',id:68,starter:"<?php\necho 'Hello, SyncFlow!';"},
  ruby:{label:'Ruby',monaco:'ruby',ext:'rb',id:72,starter:"puts 'Hello, SyncFlow!'"},
  sql:{label:'SQL',monaco:'sql',ext:'sql',id:82,starter:"SELECT 'Hello, SyncFlow!' AS message;"},
  html:{label:'HTML',monaco:'html',ext:'html',starter:'<h1>Hello, SyncFlow!</h1>'},
  css:{label:'CSS',monaco:'css',ext:'css',starter:'body { color: #fff; }'},
  json:{label:'JSON',monaco:'json',ext:'json',starter:'{\n  "message": "Hello, SyncFlow!"\n}'}
};
const roomFromUrl = new URLSearchParams(location.search).get('room') || '';

export default function App() {
  const [joined, setJoined] = useState(false);
  const [name, setName] = useState(localStorage.getItem('syncflow:name') || 'Shashwat');
  const [roomId, setRoomId] = useState(roomFromUrl);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('javascript');
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
  const [speaker, setSpeaker] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<{id:string;stream:MediaStream}[]>([]);
  const [callError, setCallError] = useState('');
  const [copied, setCopied] = useState(false);
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const socket = useRef<Socket | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStream = useRef<MediaStream|null>(null);
  const screenStream = useRef<MediaStream|null>(null);
  const peers = useRef(new Map<string,RTCPeerConnection>());
  const pendingCandidates = useRef(new Map<string,RTCIceCandidateInit[]>());

  useEffect(() => {
    if (!auth) { setAuthLoading(false); return () => { socket.current?.disconnect(); }; }
    const unsubscribe = onAuthStateChanged(auth, user => { setAuthUser(user); setAuthLoading(false); if (user?.displayName) setName(user.displayName); });
    return () => { unsubscribe(); socket.current?.disconnect(); };
  }, []);
  useEffect(() => {
    const preview = sharing ? screenStream.current : localStream.current;
    if (localVideoRef.current && preview) {
      localVideoRef.current.srcObject = preview;
      localVideoRef.current.play().catch(() => undefined);
    }
  }, [joined, sharing, video]);
  const googleLogin = async () => {
    if (authLoading) return;
    setAuthError('');
    if (!firebaseConfigured) return setAuthError('Firebase web credentials are missing in apps/web/.env.');
    setAuthLoading(true);
    try {
      await loginWithGoogle();
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      if (code === 'auth/popup-closed-by-user') setAuthError('Google sign-in window was closed. Please try again.');
      else if (code === 'auth/popup-blocked') setAuthError('Your browser blocked the Google sign-in popup. Please allow popups and try again.');
      else if (code !== 'auth/cancelled-popup-request') setAuthError(error instanceof Error ? error.message : 'Google sign-in failed.');
    } finally {
      setAuthLoading(false);
    }
  };
  const getMedia = async () => {
    if (localStream.current) return localStream.current;
    const stream = await navigator.mediaDevices.getUserMedia({audio:true,video:true});
    localStream.current=stream; stream.getAudioTracks().forEach(t=>t.enabled=mic); stream.getVideoTracks().forEach(t=>t.enabled=video);
    if(localVideoRef.current) localVideoRef.current.srcObject=stream;
    return stream;
  };
  const addPeer = async (id:string,initiator:boolean) => {
    if(peers.current.has(id)||id===socket.current?.id) return peers.current.get(id);
    const peer=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]}); peers.current.set(id,peer);
    const stream=await getMedia(); stream.getTracks().forEach(t=>peer.addTrack(t,stream));
    peer.onicecandidate=e=>{if(e.candidate)socket.current?.emit('signal',{target:id,data:{candidate:e.candidate}})};
    peer.ontrack=e=>setRemoteStreams(x=>x.some(v=>v.id===id)?x:[...x,{id,stream:e.streams[0]}]);
    peer.onconnectionstatechange=()=>{if(['failed','closed','disconnected'].includes(peer.connectionState)){peer.close();peers.current.delete(id);pendingCandidates.current.delete(id);setRemoteStreams(x=>x.filter(v=>v.id!==id))}};
    if(initiator){const offer=await peer.createOffer();await peer.setLocalDescription(offer);socket.current?.emit('signal',{target:id,data:{description:peer.localDescription}})} return peer;
  };
  const handleSignal=async(from:string,data:{description?:RTCSessionDescriptionInit;candidate?:RTCIceCandidateInit})=>{const peer=await addPeer(from,false);if(!peer)return;if(data.description){await peer.setRemoteDescription(data.description);const queued=pendingCandidates.current.get(from)||[];for(const candidate of queued){await peer.addIceCandidate(candidate)}pendingCandidates.current.delete(from);if(data.description.type==='offer'){const answer=await peer.createAnswer();await peer.setLocalDescription(answer);socket.current?.emit('signal',{target:from,data:{description:peer.localDescription}})}}else if(data.candidate){if(!peer.remoteDescription){pendingCandidates.current.set(from,[...(pendingCandidates.current.get(from)||[]),data.candidate])}else{await peer.addIceCandidate(data.candidate)}}};
  const join = async (requested=roomId) => {
    const clean=requested.trim().toLowerCase().replace(/[^a-z0-9-_]/g,'-');
    if (!authUser) return setAuthError('Please sign in with Google first.');
    if (!clean) return setAuthError('Create a room or enter a valid Room ID.');
    setRoomId(clean);
    const token = await authUser.getIdToken();
    const authResponse = await fetch(`${API}/api/auth/firebase`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (!authResponse.ok) return setAuthError((await authResponse.json()).message || 'Backend authentication failed.');
    localStorage.setItem('syncflow:name', authUser.displayName || name);
    history.replaceState(null, '', `?room=${encodeURIComponent(clean)}`);
    const s = io(API, { auth: { token } });
    socket.current = s;
    s.on('connect', () => { setConnected(true); s.emit('room:join', { roomId:clean, name }); });
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', error => setAuthError(error.message));
    s.on('room:state', state => { setCode(state.code); setLanguage(state.language||'javascript'); setNotes(state.notes); setTasks(state.tasks); setMessages(state.messages || []); setFiles(state.files || []); });
    s.on('presence:update', (next:User[])=>{setUsers(next);next.filter(u=>u.id!==s.id).forEach(u=>{if(s.id&&s.id<u.id)addPeer(u.id,true).catch(e=>setCallError(e.message))})});
    s.on('signal',({from,data})=>handleSignal(from,data).catch(e=>setCallError(e.message)));
    s.on('peer:left',({id})=>{peers.current.get(id)?.close();peers.current.delete(id);setRemoteStreams(x=>x.filter(v=>v.id!==id))});
    s.on('code:update', (payload:string|{code:string;language:string})=>{if(typeof payload==='string')setCode(payload);else{setCode(payload.code);setLanguage(payload.language)}});
    s.on('notes:update', setNotes);
    s.on('tasks:update', setTasks);
    s.on('chat:message', (m: Message) => setMessages(x => [...x.slice(-80), m]));
    s.on('file:added', (f: SharedFile) => setFiles(x => x.some(v => v.id === f.id) ? x : [...x, f]));
    setJoined(true); setAuthError('');
  };
  const createRoom=()=>join(`sync-${crypto.randomUUID().slice(0,8)}`);
  const send = () => { if (message.trim()) socket.current?.emit('chat:send', { roomId, text: message }); setMessage(''); };
  const updateTasks = (next: Task[]) => { setTasks(next); socket.current?.emit('tasks:update', { roomId, tasks: next }); };
  const addTask = () => { const title = prompt('Task name'); if (title?.trim()) updateTasks([...tasks, { id: crypto.randomUUID(), title: title.trim(), status: 'todo' }]); };
  const moveTask = (id: string) => updateTasks(tasks.map(t => t.id === id ? { ...t, status: t.status === 'todo' ? 'progress' : t.status === 'progress' ? 'done' : 'todo' } : t));
  const upload = async (file?: File) => {
    if (!file) return;
    const data = new FormData(); data.append('file', file);
    const token = await authUser?.getIdToken();
    const res = await fetch(`${API}/api/rooms/${roomId}/files`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: data });
    if (!res.ok) alert((await res.json()).message || 'Upload failed');
  };
  const run = async () => {
    if(language==='html'){const win=window.open('','_blank');win?.document.write(code);win?.document.close();setOutput('HTML preview opened in a new tab.');return}
    if(language==='css'||language==='json'){setOutput(`${languages[language].label} is validated by Monaco and does not need execution.`);return}
    if(language!=='javascript'){
      setOutput(`Running ${languages[language].label}…`);
      const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),25000);
      try {
        const token=await authUser?.getIdToken();
        const res=await fetch(`${API}/api/run`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({code,languageId:languages[language].id}),signal:controller.signal});
        const data=await res.json().catch(()=>({message:`Server returned HTTP ${res.status}.`}));
        setOutput(res.ok?(data.stdout||data.stderr||data.compile_output||data.status?.description||'Program finished without output.'):(data.message||'Execution failed. Check Judge0 configuration.'));
      } catch(error) {
        setOutput(error instanceof Error&&error.name==='AbortError'?'Execution timed out. Check Judge0 API key and subscription.':`Execution request failed: ${error instanceof Error?error.message:'Unknown network error'}`);
      } finally { clearTimeout(timeout); }
      return;
    }
    setOutput('Running JavaScript in an isolated browser worker…');
    const workerSource = `self.console={log:(...a)=>postMessage({type:'log',value:a.map(v=>typeof v==='string'?v:JSON.stringify(v)).join(' ')}),error:(...a)=>postMessage({type:'log',value:a.join(' ')})};self.onmessage=e=>{try{eval(e.data);postMessage({type:'done'})}catch(err){postMessage({type:'error',value:err.stack||err.message})}}`;
    const worker = new Worker(URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' })));
    const lines: string[] = [];
    const timer = setTimeout(() => { worker.terminate(); setOutput(lines.join('\n') || 'Execution stopped after 5 seconds.'); }, 5000);
    worker.onmessage = event => { if (event.data.type === 'log') lines.push(event.data.value); else { clearTimeout(timer); worker.terminate(); setOutput(event.data.type === 'error' ? event.data.value : lines.join('\n') || 'Program finished without output.'); } };
    worker.postMessage(code);
  };
  const changeLanguage=(next:string)=>{setLanguage(next);setCode(languages[next].starter);socket.current?.emit('code:change',{roomId,code:languages[next].starter,language:next})};
  const toggleMic=async()=>{try{const stream=await getMedia();const next=!mic;stream.getAudioTracks().forEach(t=>t.enabled=next);setMic(next)}catch(e){setCallError(e instanceof Error?e.message:'Microphone unavailable')}};
  const toggleVideo=async()=>{try{const stream=await getMedia();const next=!video;stream.getVideoTracks().forEach(t=>t.enabled=next);setVideo(next)}catch(e){setCallError(e instanceof Error?e.message:'Camera unavailable')}};
  const stopScreenShare=async()=>{const display=screenStream.current;const track=display?.getVideoTracks()[0];if(track)track.onended=null;display?.getTracks().forEach(t=>t.stop());screenStream.current=null;const camera=localStream.current?.getVideoTracks()[0];if(camera)await Promise.all([...peers.current.values()].map(p=>p.getSenders().find(s=>s.track?.kind==='video')?.replaceTrack(camera)));if(localVideoRef.current)localVideoRef.current.srcObject=localStream.current;setSharing(false)};
  const shareScreen=async()=>{try{if(sharing){await stopScreenShare();return}await getMedia();const display=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});const track=display.getVideoTracks()[0];if(!track)throw new Error('No screen video track was selected.');screenStream.current=display;if(localVideoRef.current){localVideoRef.current.srcObject=display;await localVideoRef.current.play().catch(()=>undefined)}await Promise.all([...peers.current.values()].map(p=>p.getSenders().find(s=>s.track?.kind==='video')?.replaceTrack(track)));setSharing(true);track.onended=()=>{stopScreenShare().catch(e=>setCallError(e instanceof Error?e.message:'Could not restore camera'))}}catch(e){screenStream.current?.getTracks().forEach(t=>t.stop());screenStream.current=null;setSharing(false);setCallError(e instanceof Error?e.message:'Screen sharing unavailable')}};
  const copyInvite = async () => { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); };

  if (!joined) return <Join name={name} roomId={roomId} setRoomId={setRoomId} join={()=>join()} createRoom={createRoom} user={authUser} login={googleLogin} loading={authLoading} error={authError} />;
  const lang=languages[language];
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Braces size={20}/></div><span>Sync<span>Flow</span></span></div>
      <div className="room-meta"><span className="status-dot"/><div><small>WORKSPACE</small><strong>{roomId}</strong></div><button className="icon-btn" onClick={copyInvite} title="Copy room link">{copied ? <CheckCircle2 size={17}/> : <Clipboard size={17}/>}</button></div>
      <div className="top-actions"><div className={`connection ${connected ? '' : 'offline'}`}><Wifi size={14}/>{connected ? 'Live' : 'Reconnecting'}</div><div className="avatar-stack">{users.slice(0,4).map(u => <span key={u.id} style={{background:u.color}} title={u.name}>{u.name[0]?.toUpperCase()}</span>)}</div><button className="invite-btn" onClick={copyInvite}><Users size={16}/> Invite</button><button className="icon-btn" onClick={()=>logout().then(()=>location.reload())} title="Sign out"><Settings size={18}/></button></div>
    </header>
    <main className="workspace">
      <aside className="activity-bar">
        <button className="active" title="Code"><Code2/></button><button title="Files" onClick={() => uploadRef.current?.click()}><Files/></button><button title="Chat" onClick={() => setPanel('chat')}><MessageSquare/></button><button title="Tasks" onClick={() => setPanel('tasks')}><KanbanSquare/></button><button title="Notes" onClick={() => setPanel('notes')}><NotebookPen/></button><div className="spacer"/><span className="mini-avatar">{name[0]?.toUpperCase()}</span>
      </aside>
      <section className="file-panel" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();upload(e.dataTransfer.files[0])}}>
        <div className="panel-title"><span>EXPLORER</span><button onClick={() => uploadRef.current?.click()}><FilePlus2 size={15}/></button></div>
        <div className="folder"><span>⌄</span> SYNCFLOW</div>
        <div className="file active"><span className="js-icon">{lang.ext.toUpperCase()}</span> index.{lang.ext}</div>
        {files.map(f => <a className="file" href={`${API}${f.url}`} target="_blank" key={f.id}><span className="generic-icon">•</span>{f.name}</a>)}
        <button className="dropzone" onClick={() => uploadRef.current?.click()}><FilePlus2 size={19}/><span>Drop files here</span><small>Up to 10 MB</small></button>
        <input hidden type="file" ref={uploadRef} onChange={e=>upload(e.target.files?.[0])}/>
      </section>
      <section className="editor-area">
        <div className="editor-tabs"><div className="editor-tab active"><span className="js-icon">{lang.ext.toUpperCase()}</span>index.{lang.ext} <X size={13}/></div><button className="new-tab"><Plus size={15}/></button><div className="editor-actions"><select aria-label="Language" value={language} onChange={e=>changeLanguage(e.target.value)}>{Object.entries(languages).map(([key,item])=><option value={key} key={key}>{item.label}</option>)}</select><button className="run-btn" onClick={run}><Play size={15} fill="currentColor"/> Run</button></div></div>
        <div className="breadcrumbs">syncflow <span>›</span> index.{lang.ext} <span>›</span> <Code2 size={13}/> editor</div>
        <div className="editor-wrap"><Editor height="100%" language={lang.monaco} theme="vs-dark" value={code} onChange={v=>{const next=v||'';setCode(next);socket.current?.emit('code:change',{roomId,code:next,language})}} options={{fontSize:14,fontFamily:"'JetBrains Mono', monospace",minimap:{enabled:false},padding:{top:18},scrollBeyondLastLine:false,renderLineHighlight:'all',automaticLayout:true}}/></div>
        <div className="terminal"><div className="terminal-head"><span>OUTPUT</span><button onClick={()=>setOutput('')}>CLEAR</button></div><pre>{output}</pre></div>
      </section>
      <aside className="collab-panel">
        <div className="video-grid"><div className="video-tile"><video ref={localVideoRef} autoPlay muted playsInline/><span>You</span>{!video&&<b>{name[0]?.toUpperCase()}</b>}</div>{remoteStreams.map(item=><RemoteVideo key={item.id} stream={item.stream} muted={!speaker}/>)}</div>
        <div className="collab-tabs"><button className={panel==='chat'?'active':''} onClick={()=>setPanel('chat')}><MessageSquare size={16}/>Chat</button><button className={panel==='tasks'?'active':''} onClick={()=>setPanel('tasks')}><KanbanSquare size={16}/>Tasks</button><button className={panel==='notes'?'active':''} onClick={()=>setPanel('notes')}><NotebookPen size={16}/>Notes</button></div>
        {panel === 'chat' && <><div className="channel"><Hash size={15}/>general <span>{users.length} online</span></div><div className="messages">{messages.map(m => m.system ? <div className="system-msg" key={m.id}>{m.text}</div> : <div className="message" key={m.id}><span className="message-avatar" style={{background:m.user?.color}}>{m.user?.name[0]}</span><div><strong>{m.user?.name}<time>{new Date(m.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></strong><p>{m.text}</p></div></div>)}</div><div className="composer"><input value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Message #general"/><button onClick={send}><Send size={16}/></button></div></>}
        {panel === 'tasks' && <div className="tasks"><div className="tasks-head"><div><strong>Team tasks</strong><small>Click a task to move it forward</small></div><button onClick={addTask}><Plus size={16}/></button></div>{(['todo','progress','done'] as const).map(status=><div className="task-group" key={status}><label>{status==='todo'?'TO DO':status==='progress'?'IN PROGRESS':'DONE'} <span>{tasks.filter(t=>t.status===status).length}</span></label>{tasks.filter(t=>t.status===status).map(t=><button className="task" onClick={()=>moveTask(t.id)} key={t.id}><span className={`task-dot ${status}`}/>{t.title}</button>)}</div>)}</div>}
        {panel === 'notes' && <div className="notes"><div><Sparkles size={18}/><strong>Shared notes</strong></div><textarea value={notes} onChange={e=>{setNotes(e.target.value);socket.current?.emit('notes:change',{roomId,notes:e.target.value})}}/></div>}
      </aside>
    </main>
    <footer className="callbar"><div className="call-info"><span className="pulse"/><div><strong>Team huddle</strong><small>{users.length} participant{users.length!==1?'s':''}{callError?` · ${callError}`:''}</small></div></div><div className="call-actions"><button className={!mic?'danger':''} onClick={toggleMic} title="Microphone">{mic?<Mic/>:<MicOff/>}</button><button className={video?'active':''} onClick={toggleVideo} title="Camera">{video?<Video/>:<VideoOff/>}</button><button className={speaker?'active':''} onClick={()=>setSpeaker(!speaker)} title="Speaker">{speaker?<Volume2/>:<VolumeX/>}</button><button className={sharing?'active':''} onClick={shareScreen} title="Share window or screen"><MonitorUp/></button></div><div className="call-note">WebRTC peer-to-peer call</div></footer>
  </div>;
}

function RemoteVideo({stream,muted}:{stream:MediaStream;muted:boolean}){const ref=useRef<HTMLVideoElement>(null);useEffect(()=>{if(ref.current){ref.current.srcObject=stream;ref.current.play().catch(()=>undefined)}},[stream]);return <div className="video-tile"><video ref={ref} autoPlay playsInline muted={muted}/><span>Teammate</span></div>}
function Join({name,roomId,setRoomId,join,createRoom,user,login,loading,error}:{name:string;roomId:string;setRoomId:(v:string)=>void;join:()=>void;createRoom:()=>void;user:FirebaseUser|null;login:()=>void;loading:boolean;error:string}) {
  return <div className="join-page"><div className="ambient a1"/><div className="ambient a2"/><nav><div className="brand"><div className="brand-mark"><Braces size={22}/></div><span>Sync<span>Flow</span></span></div><span className="nav-note"><span className="status-dot"/> Real-time developer workspace</span></nav><div className="join-grid"><section className="hero"><div className="eyebrow"><Sparkles size={15}/> Built for teams that ship</div><h1>Build together.<br/><span>Flow faster.</span></h1><p>Collaborative coding in 15 languages with video calls, screen sharing, chat and shared files.</p><div className="feature-row"><span><Code2/>15 languages</span><span><Video/>Video calls</span><span><MonitorUp/>Screen share</span></div></section><section className="join-card"><div className="card-icon"><Users/></div><h2>Start collaborating</h2><p>{user ? `Signed in as ${user.displayName || name}` : 'Sign in securely, then create or join a room.'}</p>{!user && <button type="button" className="google-btn" disabled={loading} onClick={login}>G&nbsp; {loading ? 'Signing in…' : 'Continue with Google'}</button>}<button type="button" className="create-room-btn" disabled={!user} onClick={createRoom}><Plus size={18}/> Create new room</button><div className="or-divider"><span>or join an existing room</span></div><label>Room ID<div className="room-input"><Hash size={18}/><input value={roomId} onChange={e=>setRoomId(e.target.value.replace(/\s/g,'-').toLowerCase())} onKeyDown={e=>e.key==='Enter'&&join()} placeholder="sync-a1b2c3d4"/></div></label><button type="button" className="join-btn" disabled={!user||!roomId.trim()} onClick={join}>Join room <span>→</span></button>{error && <small className="auth-error">{error}</small>}<small className="privacy">Google-secured access · Room data saved in MongoDB</small></section></div><footer className="landing-footer">© 2026 SyncFlow <span>Made for people who build together.</span></footer></div>;
}
