import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { io, Socket } from 'socket.io-client';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { auth, firebaseConfigured, loginWithGoogle, logout } from './firebase';
import { Bot, Braces, BriefcaseBusiness, CheckCircle2, Clipboard, Clock3, Code2, FilePlus2, Files, GitBranch, GraduationCap, Hash, History, KanbanSquare, MessageSquare, Mic, MicOff, MonitorUp, Network, NotebookPen, Play, Plus, Send, Settings, Sparkles, Users, Video, VideoOff, Volume2, VolumeX, Wifi, X } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
type User = { id: string; name: string; color: string };
type Message = { id: string; text: string; time: number; system?: boolean; user?: User };
type Task = { id: string; title: string; status: 'todo' | 'progress' | 'done' };
type SharedFile = { id: string; name: string; size: number; url: string };
type Language = { label:string; monaco:string; ext:string; id?:number; starter:string };
type EditorTab = { id:string; name:string; language:string; code:string };
type WorkspaceMode = 'team' | 'teaching' | 'interview';
type ToolPanel = 'output' | 'tests' | 'timeline' | 'ai' | 'report';
type Activity = { id:string; text:string; time:number; kind:'code'|'run'|'room'|'test'; code?:string; user?:string };
type TestCase = { id:string; input:string; expected:string; hidden:boolean };
type FeatureDrawer = 'people'|'replay'|'git'|'whiteboard'|null;
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
  const [tabs, setTabs] = useState<EditorTab[]>([{id:'main',name:'index',language:'javascript',code:''}]);
  const [activeTabId, setActiveTabId] = useState('main');
  const [notes, setNotes] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [panel, setPanel] = useState<'chat' | 'tasks' | 'notes'>('chat');
  const [message, setMessage] = useState('');
  const [output, setOutput] = useState('Ready. Click Run to execute your code.');
  const [mode, setMode] = useState<WorkspaceMode>('team');
  const [toolPanel, setToolPanel] = useState<ToolPanel>('output');
  const [timerSeconds, setTimerSeconds] = useState(45 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([{id:'start',text:'Workspace opened',time:Date.now(),kind:'room'}]);
  const [testCases, setTestCases] = useState<TestCase[]>([{id:'sample',input:'',expected:'Hello, SyncFlow!',hidden:false}]);
  const [featureDrawer, setFeatureDrawer] = useState<FeatureDrawer>(null);
  const [followUser, setFollowUser] = useState<string>('');
  const [question, setQuestion] = useState('Build a correct and efficient solution. Explain your approach.');
  const [difficulty, setDifficulty] = useState('Medium');
  const [repoUrl, setRepoUrl] = useState('');
  const [diagram, setDiagram] = useState('Client → SyncFlow API → MongoDB\n        ↘ Code Runner');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiAnswer, setAiAnswer] = useState('');
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

  const logActivity=(text:string,kind:Activity['kind']='room',snapshot?:string)=>{const item:Activity={id:crypto.randomUUID(),text,time:Date.now(),kind,code:snapshot,user:name};setActivities(current=>[...current.slice(-79),item]);socket.current?.emit('activity:add',{roomId,activity:item})};
  useEffect(()=>{if(!timerRunning||timerSeconds<=0)return;const id=window.setInterval(()=>setTimerSeconds(value=>{if(value<=1){setTimerRunning(false);return 0}return value-1}),1000);return()=>window.clearInterval(id)},[timerRunning,timerSeconds]);

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
    s.on('connect', () => { setConnected(true); logActivity('Connected to collaborative room'); s.emit('room:join', { roomId:clean, name }); });
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', error => setAuthError(error.message));
    s.on('room:state', state => { const nextLanguage=state.language||'javascript';setCode(state.code);setLanguage(nextLanguage);setTabs(current=>current.map(tab=>tab.id===activeTabId?{...tab,code:state.code,language:nextLanguage}:tab));setNotes(state.notes);setTasks(state.tasks);setMessages(state.messages || []);setFiles(state.files || []);if(state.mode)setMode(state.mode);if(state.question)setQuestion(state.question);if(state.difficulty)setDifficulty(state.difficulty);if(state.diagram)setDiagram(state.diagram);if(state.activities?.length)setActivities(state.activities); });
    s.on('presence:update', (next:User[])=>{setUsers(next);next.filter(u=>u.id!==s.id).forEach(u=>{if(s.id&&s.id<u.id)addPeer(u.id,true).catch(e=>setCallError(e.message))})});
    s.on('signal',({from,data})=>handleSignal(from,data).catch(e=>setCallError(e.message)));
    s.on('peer:left',({id})=>{peers.current.get(id)?.close();peers.current.delete(id);setRemoteStreams(x=>x.filter(v=>v.id!==id))});
    s.on('code:update', (payload:string|{code:string;language:string})=>{const nextCode=typeof payload==='string'?payload:payload.code;const nextLanguage=typeof payload==='string'?language:payload.language;setCode(nextCode);setLanguage(nextLanguage);setTabs(current=>current.map(tab=>tab.id===activeTabId?{...tab,code:nextCode,language:nextLanguage}:tab))});
    s.on('notes:update', setNotes);
    s.on('tasks:update', setTasks);
    s.on('chat:message', (m: Message) => setMessages(x => [...x.slice(-80), m]));
    s.on('file:added', (f: SharedFile) => setFiles(x => x.some(v => v.id === f.id) ? x : [...x, f]));
    s.on('workspace:settings', (settings:{mode?:WorkspaceMode;question?:string;difficulty?:string;diagram?:string})=>{if(settings.mode)setMode(settings.mode);if(settings.question!==undefined)setQuestion(settings.question);if(settings.difficulty)setDifficulty(settings.difficulty);if(settings.diagram!==undefined)setDiagram(settings.diagram)});
    s.on('activity:added',(item:Activity)=>setActivities(current=>current.some(value=>value.id===item.id)?current:[...current.slice(-79),item]));
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
  const runInBrowser=(source:string,label:string)=>{setOutput(`Running ${label} in an isolated browser worker…`);const workerSource=`self.console={log:(...a)=>postMessage({type:'log',value:a.map(v=>typeof v==='string'?v:JSON.stringify(v)).join(' ')}),error:(...a)=>postMessage({type:'log',value:a.join(' ')})};self.onmessage=e=>{try{eval(e.data);postMessage({type:'done'})}catch(err){postMessage({type:'error',value:err.stack||err.message})}}`;const worker=new Worker(URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'})));const lines:string[]=[];const timer=setTimeout(()=>{worker.terminate();setOutput(lines.join('\n')||'Execution stopped after 5 seconds.')},5000);worker.onmessage=event=>{if(event.data.type==='log')lines.push(event.data.value);else{clearTimeout(timer);worker.terminate();setOutput(event.data.type==='error'?event.data.value:lines.join('\n')||'Program finished without output.')}};worker.postMessage(source)};
  const run = async () => {
    logActivity(`Ran ${languages[language].label} code`,'run',code);
    setToolPanel('output');
    if(language==='html'){const win=window.open('','_blank');if(!win){setOutput('Preview popup was blocked. Allow popups for localhost and run again.');return}win.document.open();win.document.write(code);win.document.close();setOutput('HTML preview opened successfully in a new tab.');return}
    if(language==='css'){const win=window.open('','_blank');if(!win){setOutput('Preview popup was blocked. Allow popups for localhost and run again.');return}win.document.open();win.document.write(`<!doctype html><html><head><style>${code}</style></head><body><h1>SyncFlow CSS Preview</h1><p>Your stylesheet is applied to this sample page.</p><button>Sample button</button></body></html>`);win.document.close();setOutput('CSS preview opened successfully in a new tab.');return}
    if(language==='json'){try{const parsed=JSON.parse(code);setOutput(`Valid JSON ✓\n\n${JSON.stringify(parsed,null,2)}`)}catch(error){setOutput(`Invalid JSON ✗\n${error instanceof Error?error.message:'Unknown JSON error'}`)}return}
    if(language==='typescript'){try{setOutput('Loading TypeScript compiler…');const ts=await import('typescript');const result=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None},reportDiagnostics:true});const errors=(result.diagnostics||[]).filter(item=>item.category===ts.DiagnosticCategory.Error);if(errors.length){setOutput(errors.map(item=>ts.flattenDiagnosticMessageText(item.messageText,'\n')).join('\n'));return}runInBrowser(result.outputText,'TypeScript')}catch(error){setOutput(`TypeScript compilation failed: ${error instanceof Error?error.message:'Unknown error'}`)}return}
    if(language!=='javascript'){
      setOutput(`Running ${languages[language].label}…`);
      const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),25000);
      try {
        const token=await authUser?.getIdToken();
        const res=await fetch(`${API}/api/run`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({code,language,languageId:languages[language].id}),signal:controller.signal});
        const data=await res.json().catch(()=>({message:`Server returned HTTP ${res.status}.`}));
        if(!res.ok){setOutput(data.message||'Execution failed. Check Judge0 configuration.');return}
        const sections=[data.compile_output&&`COMPILE ERROR\n${data.compile_output}`,data.stderr&&`ERROR\n${data.stderr}`,data.stdout&&`OUTPUT\n${data.stdout}`].filter(Boolean);
        const status=data.status?.description;if(status&&status!=='Accepted')sections.push(`STATUS\n${status}`);
        if(data.time||data.memory)sections.push(`STATS\nTime: ${data.time??'-'}s · Memory: ${data.memory??'-'} KB`);
        setOutput(sections.join('\n\n')||status||'Program finished without output.');
      } catch(error) {
        setOutput(error instanceof Error&&error.name==='AbortError'?'Execution timed out. Check Judge0 API key and subscription.':`Execution request failed: ${error instanceof Error?error.message:'Unknown network error'}`);
      } finally { clearTimeout(timeout); }
      return;
    }
    runInBrowser(code,'JavaScript');
  };
  const activateTab=(id:string)=>{if(id===activeTabId)return;const saved=tabs.map(tab=>tab.id===activeTabId?{...tab,code,language}:tab);const next=saved.find(tab=>tab.id===id);if(!next)return;setTabs(saved);setActiveTabId(id);setCode(next.code);setLanguage(next.language);socket.current?.emit('code:change',{roomId,code:next.code,language:next.language})};
  const newTab=()=>{const saved=tabs.map(tab=>tab.id===activeTabId?{...tab,code,language}:tab);const id=crypto.randomUUID();const next:EditorTab={id,name:`untitled-${tabs.length+1}`,language:'javascript',code:languages.javascript.starter};setTabs([...saved,next]);setActiveTabId(id);setLanguage(next.language);setCode(next.code);socket.current?.emit('code:change',{roomId,code:next.code,language:next.language})};
  const closeTab=(id:string)=>{const saved=tabs.map(tab=>tab.id===activeTabId?{...tab,code,language}:tab);const index=saved.findIndex(tab=>tab.id===id);if(index<0)return;let remaining=saved.filter(tab=>tab.id!==id);if(!remaining.length)remaining=[{id:crypto.randomUUID(),name:'index',language:'javascript',code:''}];if(id===activeTabId){const next=remaining[Math.min(index,remaining.length-1)];setActiveTabId(next.id);setCode(next.code);setLanguage(next.language);socket.current?.emit('code:change',{roomId,code:next.code,language:next.language})}setTabs(remaining)};
  const changeLanguage=(next:string)=>{const nextCode=languages[next].starter;setLanguage(next);setCode(nextCode);setTabs(current=>current.map(tab=>tab.id===activeTabId?{...tab,language:next,code:nextCode}:tab));socket.current?.emit('code:change',{roomId,code:nextCode,language:next})};
  const toggleMic=async()=>{try{const stream=await getMedia();const next=!mic;stream.getAudioTracks().forEach(t=>t.enabled=next);setMic(next)}catch(e){setCallError(e instanceof Error?e.message:'Microphone unavailable')}};
  const toggleVideo=async()=>{try{const stream=await getMedia();const next=!video;stream.getVideoTracks().forEach(t=>t.enabled=next);setVideo(next)}catch(e){setCallError(e instanceof Error?e.message:'Camera unavailable')}};
  const stopScreenShare=async()=>{const display=screenStream.current;const track=display?.getVideoTracks()[0];if(track)track.onended=null;display?.getTracks().forEach(t=>t.stop());screenStream.current=null;const camera=localStream.current?.getVideoTracks()[0];if(camera)await Promise.all([...peers.current.values()].map(p=>p.getSenders().find(s=>s.track?.kind==='video')?.replaceTrack(camera)));if(localVideoRef.current)localVideoRef.current.srcObject=localStream.current;setSharing(false)};
  const shareScreen=async()=>{try{if(sharing){await stopScreenShare();return}await getMedia();const display=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});const track=display.getVideoTracks()[0];if(!track)throw new Error('No screen video track was selected.');screenStream.current=display;if(localVideoRef.current){localVideoRef.current.srcObject=display;await localVideoRef.current.play().catch(()=>undefined)}await Promise.all([...peers.current.values()].map(p=>p.getSenders().find(s=>s.track?.kind==='video')?.replaceTrack(track)));setSharing(true);track.onended=()=>{stopScreenShare().catch(e=>setCallError(e instanceof Error?e.message:'Could not restore camera'))}}catch(e){screenStream.current?.getTracks().forEach(t=>t.stop());screenStream.current=null;setSharing(false);setCallError(e instanceof Error?e.message:'Screen sharing unavailable')}};
  const copyInvite = async () => { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); };
  const setWorkspaceMode=(next:WorkspaceMode)=>{setMode(next);socket.current?.emit('workspace:settings',{roomId,settings:{mode:next}});logActivity(`Switched to ${next} mode`);if(next==='interview'){setTimerSeconds(45*60);setTimerRunning(true)}};
  const formatTimer=(value:number)=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
  const addTestCase=()=>setTestCases(current=>[...current,{id:crypto.randomUUID(),input:'',expected:'',hidden:mode==='interview'}]);
  const runTests=()=>{const visible=testCases.filter(test=>!test.hidden);const normalized=output.replace(/^OUTPUT\s*/,'').trim();const passed=visible.filter(test=>normalized.includes(test.expected.trim())).length;setOutput(`${passed}/${visible.length} visible tests passed${testCases.some(test=>test.hidden)?' · Hidden tests are evaluated privately.':''}`);setToolPanel('output');logActivity(`Ran ${testCases.length} test cases`,'test')};
  const aiSuggestion=output.includes('ERROR')||/error|failed|invalid/i.test(output)
    ? `I found a likely execution issue. Check the first error line, verify the selected language (${languages[language].label}), and confirm file/class naming. Apply one small fix at a time, then run the tests again.`
    : `No active error detected. Add test cases for empty input, boundary values and invalid input. Current solution has ${code.split('\n').length} lines.`;
  const askAi=async()=>{setAiBusy(true);setAiAnswer('');try{const token=await authUser?.getIdToken();const response=await fetch(`${API}/api/ai/debug`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({code,language,output})});const data=await response.json();setAiAnswer(data.answer||data.message||aiSuggestion)}catch{setAiAnswer(aiSuggestion)}finally{setAiBusy(false)}};
  const updateInterview=(nextQuestion:string,nextDifficulty=difficulty)=>{setQuestion(nextQuestion);setDifficulty(nextDifficulty);socket.current?.emit('workspace:settings',{roomId,settings:{question:nextQuestion,difficulty:nextDifficulty}})};
  const updateDiagram=(value:string)=>{setDiagram(value);socket.current?.emit('workspace:settings',{roomId,settings:{diagram:value}})};
  const restoreSnapshot=(activity:Activity)=>{if(!activity.code)return;setCode(activity.code);setTabs(current=>current.map(tab=>tab.id===activeTabId?{...tab,code:activity.code!}:tab));socket.current?.emit('code:change',{roomId,code:activity.code,language});logActivity(`Restored snapshot from ${new Date(activity.time).toLocaleTimeString()}`,'code')};
  const applyAiFix=()=>{const match=aiAnswer.match(/```(?:\w+)?\s*([\s\S]*?)```/);if(!match)return;setCode(match[1].trim());socket.current?.emit('code:change',{roomId,code:match[1].trim(),language});logActivity('Applied AI suggested fix','code',match[1].trim())};

  if (!joined) return <Join name={name} roomId={roomId} setRoomId={setRoomId} join={()=>join()} createRoom={createRoom} user={authUser} login={googleLogin} loading={authLoading} error={authError} />;
  const lang=languages[language];
  const activeTab=tabs.find(tab=>tab.id===activeTabId)||tabs[0];
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Braces size={20}/></div><span>Sync<span>Flow</span></span></div>
      <div className="room-meta"><span className="status-dot"/><div><small>WORKSPACE</small><strong>{roomId}</strong></div><button className="icon-btn" onClick={copyInvite} title="Copy room link">{copied ? <CheckCircle2 size={17}/> : <Clipboard size={17}/>}</button></div>
      <div className="mode-switch" aria-label="Workspace mode"><button className={mode==='team'?'active':''} onClick={()=>setWorkspaceMode('team')}><Users/>Team</button><button className={mode==='teaching'?'active':''} onClick={()=>setWorkspaceMode('teaching')}><GraduationCap/>Teach</button><button className={mode==='interview'?'active':''} onClick={()=>setWorkspaceMode('interview')}><BriefcaseBusiness/>Interview</button></div>
      {mode==='interview'&&<button className={`interview-timer ${timerRunning?'running':''}`} onClick={()=>setTimerRunning(value=>!value)}><Clock3/>{formatTimer(timerSeconds)}</button>}
      <div className="top-actions"><div className={`connection ${connected ? '' : 'offline'}`}><Wifi size={14}/>{connected ? 'Live' : 'Reconnecting'}</div><div className="avatar-stack">{users.slice(0,4).map(u => <span key={u.id} style={{background:u.color}} title={u.name}>{u.name[0]?.toUpperCase()}</span>)}</div><button className="invite-btn" onClick={copyInvite}><Users size={16}/> Invite</button><button className="icon-btn" onClick={()=>logout().then(()=>location.reload())} title="Sign out"><Settings size={18}/></button></div>
    </header>
    <main className="workspace">
      <aside className="activity-bar">
        <button className="active" title="Code"><Code2/></button><button title="Files" onClick={() => uploadRef.current?.click()}><Files/></button><button title="Participants & follow mode" onClick={()=>setFeatureDrawer('people')}><Users/></button><button title="Session replay" onClick={()=>setFeatureDrawer('replay')}><History/></button><button title="Git workflow" onClick={()=>setFeatureDrawer('git')}><GitBranch/></button><button title="Architecture whiteboard" onClick={()=>setFeatureDrawer('whiteboard')}><Network/></button><button title="Chat" onClick={() => setPanel('chat')}><MessageSquare/></button><button title="Tasks" onClick={() => setPanel('tasks')}><KanbanSquare/></button><button title="Notes" onClick={() => setPanel('notes')}><NotebookPen/></button><div className="spacer"/><span className="mini-avatar">{name[0]?.toUpperCase()}</span>
      </aside>
      <section className="file-panel" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();upload(e.dataTransfer.files[0])}}>
        <div className="panel-title"><span>EXPLORER</span><button onClick={() => uploadRef.current?.click()}><FilePlus2 size={15}/></button></div>
        <div className="folder"><span>⌄</span> SYNCFLOW</div>
        <div className="file active"><span className="js-icon">{lang.ext.toUpperCase()}</span> {activeTab.name}.{lang.ext}</div>
        {files.map(f => <a className="file" href={`${API}${f.url}`} target="_blank" key={f.id}><span className="generic-icon">•</span>{f.name}</a>)}
        <button className="dropzone" onClick={() => uploadRef.current?.click()}><FilePlus2 size={19}/><span>Drop files here</span><small>Up to 10 MB</small></button>
        <input hidden type="file" ref={uploadRef} onChange={e=>upload(e.target.files?.[0])}/>
      </section>
      <section className={`editor-area ${mode==='interview'?'interview':''}`}>
        <div className="editor-tabs">{tabs.map(tab=>{const tabLang=languages[tab.id===activeTabId?language:tab.language];return <button type="button" className={`editor-tab ${tab.id===activeTabId?'active':''}`} onClick={()=>activateTab(tab.id)} key={tab.id}><span className="js-icon">{tabLang.ext.toUpperCase()}</span>{tab.name}.{tabLang.ext}<span className="tab-close" role="button" aria-label={`Close ${tab.name}`} onClick={e=>{e.stopPropagation();closeTab(tab.id)}}><X size={13}/></span></button>})}<button type="button" className="new-tab" onClick={newTab} title="New file"><Plus size={15}/></button><div className="editor-actions"><select aria-label="Language" value={language} onChange={e=>changeLanguage(e.target.value)}>{Object.entries(languages).map(([key,item])=><option value={key} key={key}>{item.label}</option>)}</select><button className="run-btn" onClick={run}><Play size={15} fill="currentColor"/> Run</button></div></div>
        <div className="breadcrumbs">syncflow <span>›</span> {activeTab.name}.{lang.ext} <span>›</span> <Code2 size={13}/> editor</div>
        {mode==='interview'&&<div className="challenge-bar"><BriefcaseBusiness/><div><strong>{difficulty} challenge</strong><span>{question}</span></div><button onClick={()=>setFeatureDrawer('people')}>Candidate activity</button></div>}
        <div className="editor-wrap"><Editor height="100%" language={lang.monaco} theme="vs-dark" value={code} onChange={v=>{const next=v||'';setCode(next);setTabs(current=>current.map(tab=>tab.id===activeTabId?{...tab,code:next,language}:tab));socket.current?.emit('code:change',{roomId,code:next,language})}} options={{fontSize:14,fontFamily:"'JetBrains Mono', monospace",minimap:{enabled:false},padding:{top:18},scrollBeyondLastLine:false,renderLineHighlight:'all',automaticLayout:true}}/></div>
        <div className="terminal"><div className="terminal-head tool-tabs"><button className={toolPanel==='output'?'active':''} onClick={()=>setToolPanel('output')}>OUTPUT</button><button className={toolPanel==='tests'?'active':''} onClick={()=>setToolPanel('tests')}>TESTS</button><button className={toolPanel==='timeline'?'active':''} onClick={()=>setToolPanel('timeline')}><History/>TIMELINE</button><button className={toolPanel==='ai'?'active':''} onClick={()=>setToolPanel('ai')}><Bot/>AI DEBUG</button><button className={toolPanel==='report'?'active':''} onClick={()=>setToolPanel('report')}>REPORT</button><button className="clear-tool" onClick={()=>setOutput('')}>CLEAR</button></div>
          {toolPanel==='output'&&<pre>{output}</pre>}
          {toolPanel==='tests'&&<div className="test-panel"><div className="test-actions"><strong>Test cases</strong><span>{testCases.length} total</span><button onClick={addTestCase}><Plus/>Add test</button><button className="test-run" onClick={runTests}><Play/>Run tests</button></div>{testCases.map((test,index)=><div className="test-row" key={test.id}><b>#{index+1}</b><input placeholder="Input" value={test.input} onChange={e=>setTestCases(items=>items.map(item=>item.id===test.id?{...item,input:e.target.value}:item))}/><input placeholder="Expected output" value={test.expected} onChange={e=>setTestCases(items=>items.map(item=>item.id===test.id?{...item,expected:e.target.value}:item))}/><label><input type="checkbox" checked={test.hidden} onChange={e=>setTestCases(items=>items.map(item=>item.id===test.id?{...item,hidden:e.target.checked}:item))}/>Hidden</label></div>)}</div>}
          {toolPanel==='timeline'&&<div className="timeline-panel">{activities.slice().reverse().map(item=><div key={item.id}><span className={`activity-kind ${item.kind}`}/><time>{new Date(item.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time><p>{item.text}</p></div>)}</div>}
          {toolPanel==='ai'&&<div className="ai-panel"><span><Bot/></span><div><strong>SyncFlow Debug Assistant</strong><p>{aiAnswer||aiSuggestion}</p><div className="ai-actions"><button onClick={askAi} disabled={aiBusy}>{aiBusy?'Analyzing…':'Analyze code'}</button><button onClick={applyAiFix} disabled={!/```/.test(aiAnswer)}>Apply Fix</button><button onClick={()=>{setToolPanel('tests');logActivity('Opened tests from AI suggestion')}}>Create tests</button></div></div></div>}
          {toolPanel==='report'&&<div className="report-panel"><div><small>SESSION MODE</small><strong>{mode.toUpperCase()}</strong></div><div><small>CODE ACTIVITY</small><strong>{activities.filter(a=>a.kind==='code'||a.kind==='run').length} events</strong></div><div><small>RUNS & TESTS</small><strong>{activities.filter(a=>a.kind==='run'||a.kind==='test').length}</strong></div><div><small>PARTICIPANTS</small><strong>{users.length}</strong></div><button onClick={()=>navigator.clipboard.writeText(`SyncFlow session ${roomId}: ${users.length} participants, ${activities.length} activities, mode ${mode}.`)}><Clipboard/>Copy summary</button></div>}
        </div>
      </section>
      <aside className="collab-panel">
        <div className="video-grid"><div className="video-tile"><video ref={localVideoRef} autoPlay muted playsInline/><span>You</span>{!video&&<b>{name[0]?.toUpperCase()}</b>}</div>{remoteStreams.map(item=><RemoteVideo key={item.id} stream={item.stream} muted={!speaker}/>)}</div>
        <div className="collab-tabs"><button className={panel==='chat'?'active':''} onClick={()=>setPanel('chat')}><MessageSquare size={16}/>Chat</button><button className={panel==='tasks'?'active':''} onClick={()=>setPanel('tasks')}><KanbanSquare size={16}/>Tasks</button><button className={panel==='notes'?'active':''} onClick={()=>setPanel('notes')}><NotebookPen size={16}/>Notes</button></div>
        {panel === 'chat' && <><div className="channel"><Hash size={15}/>general <span>{users.length} online</span></div><div className="messages">{messages.map(m => m.system ? <div className="system-msg" key={m.id}>{m.text}</div> : <div className="message" key={m.id}><span className="message-avatar" style={{background:m.user?.color}}>{m.user?.name[0]}</span><div><strong>{m.user?.name}<time>{new Date(m.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></strong><p>{m.text}</p></div></div>)}</div><div className="composer"><input value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Message #general"/><button onClick={send}><Send size={16}/></button></div></>}
        {panel === 'tasks' && <div className="tasks"><div className="tasks-head"><div><strong>Team tasks</strong><small>Click a task to move it forward</small></div><button onClick={addTask}><Plus size={16}/></button></div>{(['todo','progress','done'] as const).map(status=><div className="task-group" key={status}><label>{status==='todo'?'TO DO':status==='progress'?'IN PROGRESS':'DONE'} <span>{tasks.filter(t=>t.status===status).length}</span></label>{tasks.filter(t=>t.status===status).map(t=><button className="task" onClick={()=>moveTask(t.id)} key={t.id}><span className={`task-dot ${status}`}/>{t.title}</button>)}</div>)}</div>}
        {panel === 'notes' && <div className="notes"><div><Sparkles size={18}/><strong>Shared notes</strong></div><textarea value={notes} onChange={e=>{setNotes(e.target.value);socket.current?.emit('notes:change',{roomId,notes:e.target.value})}}/></div>}
      </aside>
    </main>
    {featureDrawer&&<div className="feature-drawer"><div className="drawer-head"><div><small>SYNCFLOW LAB</small><strong>{featureDrawer==='people'?'Participants & Follow Mode':featureDrawer==='replay'?'Session Replay':featureDrawer==='git'?'Collaborative Git Workflow':'Architecture Whiteboard'}</strong></div><button onClick={()=>setFeatureDrawer(null)}><X/></button></div>
      {featureDrawer==='people'&&<div className="people-tools"><p>Click a participant to follow their shared workspace activity.</p>{users.map(user=><button className={followUser===user.id?'selected':''} key={user.id} onClick={()=>setFollowUser(followUser===user.id?'':user.id)}><span style={{background:user.color}}>{user.name[0]}</span><div><strong>{user.name}</strong><small>{followUser===user.id?'Following active file and updates':'Online · click to follow'}</small></div></button>)}{mode==='interview'&&<div className="interview-setup"><label>Difficulty<select value={difficulty} onChange={e=>updateInterview(question,e.target.value)}><option>Easy</option><option>Medium</option><option>Hard</option></select></label><label>Problem statement<textarea value={question} onChange={e=>updateInterview(e.target.value)}/></label></div>}</div>}
      {featureDrawer==='replay'&&<div className="replay-list">{activities.slice().reverse().map(item=><button key={item.id} disabled={!item.code} onClick={()=>restoreSnapshot(item)}><span className={`activity-kind ${item.kind}`}/><div><strong>{item.text}</strong><small>{item.user||'SyncFlow'} · {new Date(item.time).toLocaleTimeString()}</small></div>{item.code&&<em>Restore</em>}</button>)}</div>}
      {featureDrawer==='git'&&<div className="git-tools"><p>Connect a public GitHub repository to plan branches, review diffs and prepare a pull request.</p><label>Repository URL<input value={repoUrl} onChange={e=>setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repository"/></label><div><button disabled={!/^https:\/\/github\.com\//.test(repoUrl)} onClick={()=>window.open(repoUrl,'_blank')}>Open repository</button><button onClick={()=>navigator.clipboard.writeText(`feat: update ${activeTab.name}.${lang.ext}\n\nBuilt collaboratively in SyncFlow room ${roomId}`)}>Generate commit message</button><button onClick={()=>navigator.clipboard.writeText(`## SyncFlow session\n- Room: ${roomId}\n- Mode: ${mode}\n- Participants: ${users.length}\n- Activities: ${activities.length}`)}>Copy PR summary</button></div><small>Branch creation and push require GitHub OAuth and are intentionally not performed with a personal token in the browser.</small></div>}
      {featureDrawer==='whiteboard'&&<div className="whiteboard-tools"><p>Shared architecture canvas — changes sync with everyone in the room.</p><textarea value={diagram} onChange={e=>updateDiagram(e.target.value)} spellCheck={false}/><div className="diagram-preview">{diagram.split('\n').map((line,index)=><div key={index}>{line}</div>)}</div></div>}
    </div>}
    <footer className="callbar"><div className="call-info"><span className="pulse"/><div><strong>Team huddle</strong><small>{users.length} participant{users.length!==1?'s':''}{callError?` · ${callError}`:''}</small></div></div><div className="call-actions"><button className={!mic?'danger':''} onClick={toggleMic} title="Microphone">{mic?<Mic/>:<MicOff/>}</button><button className={video?'active':''} onClick={toggleVideo} title="Camera">{video?<Video/>:<VideoOff/>}</button><button className={speaker?'active':''} onClick={()=>setSpeaker(!speaker)} title="Speaker">{speaker?<Volume2/>:<VolumeX/>}</button><button className={sharing?'active':''} onClick={shareScreen} title="Share window or screen"><MonitorUp/></button></div><div className="call-note">WebRTC peer-to-peer call</div></footer>
  </div>;
}

function RemoteVideo({stream,muted}:{stream:MediaStream;muted:boolean}){const ref=useRef<HTMLVideoElement>(null);useEffect(()=>{if(ref.current){ref.current.srcObject=stream;ref.current.play().catch(()=>undefined)}},[stream]);return <div className="video-tile"><video ref={ref} autoPlay playsInline muted={muted}/><span>Teammate</span></div>}
function GoogleMark(){return <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.37l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.6 0-4.81-1.76-5.6-4.13H3.05v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.92A6.02 6.02 0 0 1 6.08 12c0-.67.11-1.32.32-1.92V7.46H3.05A10 10 0 0 0 2 12c0 1.61.39 3.14 1.05 4.54l3.35-2.62Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.78.5 3.82 1.49l2.88-2.88A9.66 9.66 0 0 0 12 2a10 10 0 0 0-8.95 5.46l3.35 2.62c.79-2.37 3-4.13 5.6-4.13Z"/></svg>}
function Join({name,roomId,setRoomId,join,createRoom,user,login,loading,error}:{name:string;roomId:string;setRoomId:(v:string)=>void;join:()=>void;createRoom:()=>void;user:FirebaseUser|null;login:()=>void;loading:boolean;error:string}) {
  return <div className="join-page"><div className="ambient a1"/><div className="ambient a2"/><nav><div className="brand"><div className="brand-mark"><Braces size={22}/></div><span>Sync<span>Flow</span></span></div><span className="nav-note"><span className="status-dot"/> Real-time developer workspace</span></nav><div className="join-grid"><section className="hero"><div className="eyebrow"><Sparkles size={15}/> Built for teams that ship</div><h1>Build together.<br/><span>Flow faster.</span></h1><p>Collaborative coding in 15 languages with video calls, screen sharing, chat and shared files.</p><div className="feature-row"><span><Code2/>15 languages</span><span><Video/>Video calls</span><span><MonitorUp/>Screen share</span></div></section><section className="join-card"><div className="card-icon"><Users/></div><h2>Start collaborating</h2><p>{user ? `Signed in as ${user.displayName || name}` : 'Sign in securely, then create or join a room.'}</p>{!user && <button type="button" className="google-btn" disabled={loading} onClick={login}><GoogleMark/><span>{loading ? 'Signing in…' : 'Continue with Google'}</span></button>}<button type="button" className="create-room-btn" disabled={!user} onClick={createRoom}><Plus size={18}/> Create new room</button><div className="or-divider"><span>or join an existing room</span></div><label>Room ID<div className="room-input"><Hash size={18}/><input value={roomId} onChange={e=>setRoomId(e.target.value.replace(/\s/g,'-').toLowerCase())} onKeyDown={e=>e.key==='Enter'&&join()} placeholder="sync-a1b2c3d4"/></div></label><button type="button" className="join-btn" disabled={!user||!roomId.trim()} onClick={join}>Join room <span>→</span></button>{error && <small className="auth-error">{error}</small>}<small className="privacy">Google-secured access · Room data saved in MongoDB</small></section></div><footer className="landing-footer">© 2026 SyncFlow <span>Made for people who build together.</span></footer></div>;
}
