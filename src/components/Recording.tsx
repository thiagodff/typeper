import { ArrowUp, LoaderCircle, Mic, RotateCcw, X } from 'lucide-react';
import { clock } from '../lib/format';
import type { CaptureState } from '../lib/types';

export function Recording({ state, action }: { state:CaptureState; action:(action:string)=>void }) {
  if(state.phase==='idle') return null;
  if(state.phase==='error') return <div className="error-panel" role="alert"><div><strong>Não foi possível concluir</strong><p>{state.message}</p>{state.canRetry&&<small>O áudio está só na memória. Fechar o aplicativo descarta essa gravação.</small>}</div><div className="button-row">{state.canRetry&&<button className="button secondary" onClick={()=>action('retry')}><RotateCcw size={15}/>Tentar novamente</button>}<button className="button text-button" onClick={()=>action('cancel')}>Descartar</button></div></div>;
  const waiting=state.phase==='transcribing';
  return <div className="recording-pill" role="status" aria-live="polite">
    {waiting?<LoaderCircle className="spin" size={23}/>:<span className="live-wave">{Array.from({length:11},(_,i)=><i key={i} style={{height:`${5+state.level*(12+18*Math.abs(Math.sin(i*1.8+state.seconds*3)))}px`}}/>)}</span>}
    <div><strong>{waiting?'Transcrevendo…':state.phase==='ready'?'Pronto para enviar':state.paused?'Pode pensar…':'Ouvindo você'}</strong><small>{waiting?'A janela de destino continua selecionada.':state.paused?'Fale para continuar.':'Enter envia · Esc cancela'}</small></div>
    <span className="recording-time">{clock(state.seconds)}</span>
    {!waiting&&<><button className="pill-cancel" aria-label="Cancelar gravação" onClick={()=>action('cancel')}><X size={18}/></button><button className="pill-send" aria-label="Enviar para transcrição" onClick={()=>action('finish')}><ArrowUp size={18}/></button></>}
    {waiting&&<Mic className="subtle" size={16}/>}
  </div>;
}
