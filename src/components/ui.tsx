import { useEffect, useRef, type ReactNode } from 'react';
import { AudioLines, Check, Copy, Sparkles, X } from 'lucide-react';
import { shortcutKeys } from '../lib/format';
import type { Provider } from '../lib/types';

export function Logo() { return <div className="brand"><img src="/typeper.svg" alt=""/><span>typeper<span className="brand-dot">.</span></span></div>; }
export function Shortcut({ value }: { value: string }) { return <span className="shortcut">{shortcutKeys(value).map(key=><kbd key={key}>{key}</kbd>)}</span>; }
export function ProviderIcon({ provider }: { provider: Provider }) { return <span className={`provider-icon ${provider}`}>{provider==='openai'?<AudioLines size={22}/>:<Sparkles size={22}/>}</span>; }
export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) { return <div className="empty"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{children}</p></div>; }
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value:boolean)=>void; label:string; disabled?:boolean }) { return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`toggle ${checked?'on':''}`} onClick={()=>onChange(!checked)}><span/></button>; }
export function CopyButton({ onClick, copied = false, compact = false }: { onClick:()=>void; copied?:boolean; compact?:boolean }) { return <button className={compact?'icon-button':'button secondary'} aria-label="Copiar transcrição" title="Copiar transcrição" onClick={onClick}>{copied?<Check size={16}/>:<Copy size={16}/>} {!compact && (copied?'Copiado':'Copiar texto')}</button>; }
export function Dialog({ title, children, onClose }: { title:string; children:ReactNode; onClose:()=>void }) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ref.current?.showModal();},[]);
  return <dialog ref={ref} className="dialog" onCancel={event=>{event.preventDefault();onClose();}} aria-labelledby="dialog-title"><div className="section-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18}/></button></div>{children}</dialog>;
}
