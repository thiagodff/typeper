import { useCallback, useEffect, useState } from 'react';
import { Activity as ActivityIcon, Check, ChevronRight, CircleHelp, History as HistoryIcon, Laptop, Settings2, ShieldCheck, X } from 'lucide-react';
import { Activity } from './pages/Activity';
import { History } from './pages/History';
import { Settings } from './pages/Settings';
import { Logo, Dialog, Shortcut } from './components/ui';
import { Recording } from './components/Recording';
import { call, demo, desktop, on } from './lib/api';
import { defaults, idle, type CaptureState, type KeyStatus, type Page, type ProviderStats, type Snapshot, type Transcript } from './lib/types';

const emptyKeys:KeyStatus={openai:{saved:false,error:null},gemini:{saved:false,error:null}};
export default function App() {
  const [page,setPage]=useState<Page>('activity');const [settings,setSettings]=useState(defaults);
  const [capture,setCapture]=useState(idle);const [extension,setExtension]=useState(false);
  const [keys,setKeys]=useState(emptyKeys);const [stats,setStats]=useState<ProviderStats[]>([]);
  const [recent,setRecent]=useState<Transcript[]>([]);const [revision,setRevision]=useState(0);
  const [message,setMessage]=useState('');const [help,setHelp]=useState(false);const [fatal,setFatal]=useState('');
  const [recovered,setRecovered]=useState<Transcript|null>(null);
  const busy=['recording','ready','transcribing'].includes(capture.phase);
  const refresh=useCallback(()=>setRevision(n=>n+1),[]);
  useEffect(()=>{
    let alive=true;
    Promise.all([call<Snapshot>('snapshot'),call<KeyStatus>('key_status'),call<ProviderStats[]>('stats'),call<Transcript[]>('history',{query:'',provider:'',offset:0})]).then(([snapshot,keys,stats,recent])=>{
      if(!alive)return;setSettings(snapshot.settings);setCapture(snapshot.capture);setExtension(snapshot.extensionConnected);setKeys(keys);setStats(stats);setRecent(recent);setFatal('');
    }).catch(error=>{if(alive)setFatal(String(error));});
    return()=>{alive=false;};
  },[revision]);
  useEffect(()=>{
    const listeners=[on<CaptureState>('capture-state',state=>{setCapture(state);if(state.message&&state.phase==='idle')setMessage(state.message);}),on('data-changed',refresh),on<Page>('navigate',setPage),on<Transcript>('transcript',setRecovered)];
    const interval=setInterval(()=>{call<Snapshot>('snapshot').then(data=>setExtension(data.extensionConnected)).catch(()=>setExtension(false));},5000);
    return()=>{listeners.forEach(promise=>promise.then(dispose=>dispose()));clearInterval(interval);};
  },[refresh]);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    const apply=()=>{document.documentElement.dataset.theme=settings.theme==='system'?(media.matches?'dark':'light'):settings.theme;};
    apply();media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);
  },[settings.theme]);
  useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(''),5500);return()=>clearTimeout(timer);},[message]);
  const control=useCallback(async(action:string)=>{try{await call('control',{action});}catch(e){setMessage(String(e));}},[]);
  useEffect(()=>{
    const handler=(event:KeyboardEvent)=>{
      if(!['recording','ready'].includes(capture.phase))return;
      if(event.key==='Escape'||event.key==='Enter'){event.preventDefault();void control(event.key==='Escape'?'cancel':'finish');}
    };window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
  },[capture.phase,control]);
  async function copy(text:string){try{await call('copy_text',{text});setMessage('Texto copiado.');}catch(e){setMessage(String(e));}}
  const titles={activity:'Atividade',history:'Histórico',settings:'Configurações'};
  return <div className="app-shell"><aside className="sidebar"><Logo/><div className="workspace-label">PESSOAL</div><nav aria-label="Navegação principal">{[{id:'activity',icon:<ActivityIcon size={19}/>,label:'Atividade'},{id:'history',icon:<HistoryIcon size={19}/>,label:'Histórico'},{id:'settings',icon:<Settings2 size={19}/>,label:'Configurações'}].map(item=><button className={`nav-item ${page===item.id?'active':''}`} key={item.id} onClick={()=>setPage(item.id as Page)} aria-current={page===item.id?'page':undefined}>{item.icon}{item.label}{page===item.id&&<span className="nav-dot"/>}</button>)}</nav><div className="sidebar-bottom"><div className="shortcut-card"><span>SUAS IDEIAS, EM UM ATALHO</span><Shortcut value={settings.shortcut}/><small>{settings.mode==='hold'?'Segure, fale e solte.':'Aperte, fale e confirme.'}</small></div><button className="help-link" onClick={()=>setHelp(true)}><CircleHelp size={17}/>Como funciona<ChevronRight size={14}/></button><div className="app-version"><span className="tiny-logo">t.</span><span>Typeper <small>v0.1.0</small></span><ShieldCheck size={14}/></div></div></aside>
    <div className="main-shell"><header className="topbar"><div><span className="muted">Seu espaço</span><ChevronRight size={13}/><strong>{titles[page]}</strong></div><span className={`desktop-status ${extension?'ready':''}`}><i/>{desktop?(extension?'GNOME conectado':'Integração pendente'):(demo?'Prévia · dados de exemplo':'Prévia para Linux')}<Laptop size={15}/></span></header>
      <main>{fatal?<div className="page"><div className="error-panel" role="alert"><p>{fatal}</p><button className="button secondary" onClick={refresh}>Tentar novamente</button></div></div>:page==='activity'?<Activity settings={settings} keys={keys} stats={stats} recent={recent} page={setPage} copy={copy} action={()=>void control('toggle')} busy={busy}/>:page==='history'?<History revision={revision} copy={copy} toast={setMessage} changed={refresh}/>:<Settings settings={settings} keys={keys} extensionConnected={extension} refresh={refresh} toast={setMessage} busy={busy}/>}</main>
      <Recording state={capture} action={action=>void control(action)}/>
      {recovered&&!recent.some(r=>r.id===recovered.id)&&capture.phase==='idle'&&<div className="recovery-result"><strong>Último resultado</strong><p>{recovered.text}</p><button className="button secondary" onClick={()=>copy(recovered.text)}>Copiar</button><button className="icon-button" aria-label="Fechar resultado" onClick={()=>setRecovered(null)}><X size={16}/></button></div>}
    </div>
    {message&&<div className="toast" role="status"><Check size={17}/><span>{message}</span><button className="icon-button" aria-label="Fechar aviso" onClick={()=>setMessage('')}><X size={15}/></button></div>}
    {help&&<Dialog title="Da voz ao texto, em três passos" onClose={()=>setHelp(false)}><ol className="help-steps"><li><strong>Conecte sua API</strong><p>Adicione uma chave da OpenAI ou do Gemini nas configurações e ative a extensão GNOME.</p></li><li><strong>Escolha onde escrever</strong><p>Clique em um campo de texto e use <Shortcut value={settings.shortcut}/> para começar.</p></li><li><strong>Fale e confirme</strong><p>No modo alternar, use Enter ou o atalho novamente. No modo segurar, solte o atalho. Esc cancela sem enviar.</p></li></ol><div className="notice"><ShieldCheck size={20}/><span>O texto fica no Ctrl + V. Se você trocar de janela durante a transcrição, use a colagem manual.</span></div><p className="muted small">Até 5 minutos por gravação. O microfone continua detectando fala durante as pausas, mas os silêncios longos são descartados. O histórico fica neste dispositivo.</p><button className="button primary" onClick={()=>setHelp(false)}>Entendi</button></Dialog>}
  </div>;
}
