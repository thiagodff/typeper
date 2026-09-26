import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const APP = 'io.github.typeper.Typeper';
const PATH = '/io/github/typeper/Typeper';
const XML = `<node><interface name="${APP}">
  <method name="Hello"><arg type="s" direction="out"/></method>
  <method name="Toggle"/><method name="Release"/><method name="Finish"/><method name="Cancel"/>
  <method name="Open"><arg type="s" direction="in"/></method>
  <method name="Microphones"><arg type="s" direction="out"/></method>
  <method name="UpdateChoice"><arg type="s" direction="in"/><arg type="s" direction="in"/></method>
  <signal name="CaptureChanged"><arg type="s"/></signal>
  <signal name="SettingsChanged"><arg type="s"/></signal>
</interface></node>`;
const ShellXML = `<node><interface name="io.github.typeper.Shell">
  <method name="Deliver"><arg type="s" direction="in"/><arg type="b" direction="in"/><arg type="s" direction="out"/></method>
</interface></node>`;
const Proxy = Gio.DBusProxy.makeProxyWrapper(XML);
const shortcuts = {
  '<Control><Super>space': {key:Clutter.KEY_space, mask:Clutter.ModifierType.CONTROL_MASK | Clutter.ModifierType.MOD4_MASK},
  '<Control><Alt>space': {key:Clutter.KEY_space, mask:Clutter.ModifierType.CONTROL_MASK | Clutter.ModifierType.MOD1_MASK},
  '<Super><Shift>d': {key:Clutter.KEY_d, mask:Clutter.ModifierType.MOD4_MASK | Clutter.ModifierType.SHIFT_MASK},
  '<Control><Shift>F9': {key:Clutter.KEY_F9, mask:Clutter.ModifierType.CONTROL_MASK | Clutter.ModifierType.SHIFT_MASK},
};

export default class TypeperExtension extends Extension {
  enable() {
    this._alive = true;
    this._sources = new Set();
    this._settings = {shortcut:'<Control><Super>space',mode:'toggle'};
    this._phase = 'idle';
    this._target = null;
    this._virtualKeyboard = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    this._indicator = new PanelMenu.Button(0.0, 'Typeper');
    this._indicator.add_child(new St.Icon({icon_name:'audio-input-microphone-symbolic',style_class:'system-status-icon'}));
    this._status = new PopupMenu.PopupMenuItem('Abra o Typeper para conectar', {reactive:false});
    this._indicator.menu.addMenuItem(this._status);
    this._indicator.menu.addAction('Abrir Typeper', () => this._open('activity'));
    this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    this._providerMenu = new PopupMenu.PopupSubMenuMenuItem('Transcrição');
    this._indicator.menu.addMenuItem(this._providerMenu);
    for (const [id,name] of [['openai','OpenAI'],['gemini','Gemini']])
      this._providerMenu.menu.addAction(name, () => this._call('UpdateChoice','provider',id));
    this._micMenu = new PopupMenu.PopupSubMenuMenuItem('Microfone');
    this._indicator.menu.addMenuItem(this._micMenu);
    this._languageMenu = new PopupMenu.PopupSubMenuMenuItem('Idioma');
    this._indicator.menu.addMenuItem(this._languageMenu);
    for (const [id,name] of [['auto','Automático'],['pt-BR','Português'],['en-US','English'],['es-ES','Español'],['ja-JP','日本語']])
      this._languageMenu.menu.addAction(name, () => this._call('UpdateChoice','language',id));
    this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    this._indicator.menu.addAction('Histórico', () => this._open('history'));
    this._indicator.menu.addAction('Configurações', () => this._open('settings'));
    this._indicator.menu.connect('open-state-changed', (_menu,open) => { if(open) this._loadMicrophones(); });
    Main.panel.addToStatusArea(this.uuid,this._indicator);

    this._pill = new St.BoxLayout({style_class:'typeper-pill',reactive:true,can_focus:true,visible:false});
    this._wave = new St.BoxLayout({style_class:'typeper-wave',y_align:Clutter.ActorAlign.CENTER});
    this._bars = Array.from({length:13}, () => {
      const bar = new St.Widget({style_class:'typeper-bar',height:5,y_align:Clutter.ActorAlign.CENTER});
      this._wave.add_child(bar); return bar;
    });
    this._label = new St.Label({text:'Ouvindo',style_class:'typeper-label',y_align:Clutter.ActorAlign.CENTER});
    this._timer = new St.Label({text:'0:00',style_class:'typeper-timer',y_align:Clutter.ActorAlign.CENTER});
    this._hint = new St.Label({text:'↵ enviar · esc cancelar',style_class:'typeper-hint',y_align:Clutter.ActorAlign.CENTER});
    for(const child of [this._wave,this._label,this._timer,this._hint]) this._pill.add_child(child);
    Main.layoutManager.addChrome(this._pill,{trackFullscreen:true});
    this._keySignal = this._pill.connect('key-press-event',(_actor,event)=>this._key(event,true));
    this._releaseSignal = this._pill.connect('key-release-event',(_actor,event)=>this._key(event,false));
    this._acceleratorSignal = global.display.connect('accelerator-activated',(_display,action)=>{
      if(action===this._accelerator && !this._grab && this._connected) this._begin();
    });
    this._exported = Gio.DBusExportedObject.wrapJSObject(ShellXML,{Deliver:(text,paste)=>this._deliver(text,paste)});
    this._exported.export(Gio.DBus.session,'/io/github/typeper/Shell');
    this._ownedName = Gio.bus_own_name_on_connection(Gio.DBus.session,'io.github.typeper.Shell',Gio.BusNameOwnerFlags.NONE,null,null);
    this._proxy = new Proxy(Gio.DBus.session,APP,PATH,(proxy,error)=>{
      if(!this._alive) return;
      if(error) { this._status.label.text='Typeper indisponível'; return; }
      this._proxy=proxy;
      this._captureSignal=proxy.connectSignal('CaptureChanged',(_proxy,_sender,[json])=>this._update(JSON.parse(json)));
      this._settingsSignal=proxy.connectSignal('SettingsChanged',(_proxy,_sender,[json])=>this._configure(JSON.parse(json)));
      this._ownerSignal=proxy.connect('notify::g-name-owner',()=>this._hello());
      this._hello();
    });
    this._heartbeat=GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,5,()=>{this._hello();return GLib.SOURCE_CONTINUE;});
    this._sessionSignal=Main.sessionMode.connect('updated',()=>{
      if(Main.sessionMode.isLocked || Main.sessionMode.isGreeter) {this._call('Cancel');this._end();this._target=null;}
    });
  }

  _later(ms,fn) {
    const id=GLib.timeout_add(GLib.PRIORITY_DEFAULT,ms,()=>{this._sources.delete(id);if(this._alive) fn();return GLib.SOURCE_REMOVE;});
    this._sources.add(id);return id;
  }
  _call(method,...args) {
    if(!this._proxy?.g_name_owner) return;
    this._proxy[`${method}Remote`](...args,(_result,error)=>{
      if(error && this._alive) {this._end();Main.notify('Typeper','Não foi possível executar a ação. Confira o aplicativo.');}
    });
  }
  _open(page) {
    if(this._proxy?.g_name_owner) this._call('Open',page);
    else {
      try { Gio.Subprocess.new(['typeper'],Gio.SubprocessFlags.NONE); }
      catch { Main.notify('Typeper','Abra o aplicativo instalado ou execute npm run desktop na pasta do projeto.'); }
    }
  }
  _hello() {
    if(!this._proxy?.g_name_owner) {
      this._connected=false;this._phase='idle';this._end();this._target=null;
      this._status.label.text='Abra o Typeper para conectar';return;
    }
    this._proxy.HelloRemote(([json],error)=>{
      if(!this._alive) return;
      if(error) {this._connected=false;this._end();return;}
      this._connected=true;
      const data=JSON.parse(json);this._configure(data.settings);
      this._status.label.text='Typeper conectado';
      if(!['recording','ready'].includes(data.state.phase) && this._grab && !this._starting) this._end();
    });
  }
  _configure(settings) {
    const changed=this._settings.shortcut!==settings.shortcut || !this._accelerator;
    this._settings=settings;
    this._providerMenu.label.text=`Transcrição · ${settings.provider==='openai'?'OpenAI':'Gemini'}`;
    this._languageMenu.label.text=`Idioma · ${settings.language==='auto'?'automático':settings.language}`;
    if(changed) {
      if(this._accelerator) {Main.wm.allowKeybinding(Meta.external_binding_name_for_action(this._accelerator),Shell.ActionMode.NONE);global.display.ungrab_accelerator(this._accelerator);}
      this._accelerator=global.display.grab_accelerator(settings.shortcut,Meta.KeyBindingFlags.NONE);
      if(this._accelerator) Main.wm.allowKeybinding(Meta.external_binding_name_for_action(this._accelerator),Shell.ActionMode.NORMAL);
      else Main.notify('Typeper','Atalho em uso. Escolha outro nas configurações.');
    }
  }
  _loadMicrophones() {
    if(!this._proxy?.g_name_owner) return;
    this._proxy.MicrophonesRemote(([json],error)=>{
      if(!this._alive || error) return;
      this._micMenu.menu.removeAll();
      for(const device of JSON.parse(json)) {
        const item=this._micMenu.menu.addAction(device.name,()=>this._call('UpdateChoice','microphone',device.id));
        if(device.id===this._settings.microphone) item.setOrnament(PopupMenu.Ornament.DOT);
      }
    });
  }
  _begin() {
    if(['transcribing','error'].includes(this._phase)) {this._open('activity');return;}
    this._target=global.display.focus_window;
    this._shortcutDown=true;this._starting=true;this._ending=null;
    this._show();
    this._call('Toggle');
    // Never leave a keyboard grab behind if the native process fails to start capture.
    this._later(6000,()=>{if(this._starting){this._starting=false;this._call('Cancel');this._end();}});
  }
  _show() {
    const monitor=Main.layoutManager.currentMonitor ?? Main.layoutManager.primaryMonitor;
    const area=global.workspace_manager.get_active_workspace().get_work_area_for_monitor(monitor.index);
    this._pill.show();this._pill.set_position(area.x+(area.width-580)/2,area.y+area.height-106);
    if(!this._grab) this._grab=Main.pushModal(this._pill,{actionMode:Shell.ActionMode.NONE});
    this._label.text='Preparando';this._timer.text='0:00';
    this._hint.text=this._settings.mode==='hold'?'solte para enviar · esc cancelar':'↵ enviar · esc cancelar';
  }
  _key(event,pressed) {
    const key=event.get_key_symbol();
    const shortcut=shortcuts[this._settings.shortcut];
    if(pressed) {
      if(key===Clutter.KEY_Escape) this._ending='Cancel';
      else if(key===Clutter.KEY_Return || key===Clutter.KEY_KP_Enter) this._ending='Finish';
      else if(shortcut && Clutter.keysym_to_lower(key)===shortcut.key && (event.get_state() & shortcut.mask)===shortcut.mask) {
        if(!this._shortcutDown && this._settings.mode==='toggle') this._ending='Finish';
        this._shortcutDown=true;
      }
    } else {
      const modifiers=[Clutter.KEY_Control_L,Clutter.KEY_Control_R,Clutter.KEY_Super_L,Clutter.KEY_Super_R,Clutter.KEY_Alt_L,Clutter.KEY_Alt_R,Clutter.KEY_Shift_L,Clutter.KEY_Shift_R];
      const triggerReleased=shortcut && Clutter.keysym_to_lower(key)===shortcut.key;
      if(triggerReleased) this._shortcutDown=false;
      if(this._ending || (this._settings.mode==='hold' && (triggerReleased || modifiers.includes(key)))) {
        this._call(this._ending ?? 'Release');this._ending=null;this._starting=false;this._end();
      }
    }
    return Clutter.EVENT_STOP;
  }
  _update(state) {
    if(!this._alive) return;
    this._phase=state.phase;
    if(state.phase==='recording' || state.phase==='ready') {
      this._starting=false;
      // Also supports recording started through the app or tray.
      if(!this._grab) {this._target=global.display.focus_window;this._show();}
      this._label.text=state.phase==='ready'?'Pronto para enviar':state.paused?'Pode pensar…':'Ouvindo';
      this._timer.text=`${Math.floor(state.seconds/60)}:${String(Math.floor(state.seconds%60)).padStart(2,'0')}`;
      this._bars.forEach((bar,i)=>{bar.height=state.paused?5:5+Math.round(state.level*(10+23*Math.abs(Math.sin(i*1.7+state.seconds*4))));});
    } else {
      this._starting=false;this._end();
      if(state.phase==='error') Main.notify('Typeper',state.message);
    }
  }
  _end() {
    if(this._grab) {Main.popModal(this._grab);this._grab=null;}
    this._pill?.hide();
  }
  _deliver(text,paste) {
    if(Main.sessionMode.isLocked) return 'locked';
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD,text);
    this._end();
    const target=this._target;
    this._target=null;
    if(!paste || !target || global.display.focus_window!==target) return 'clipboard';
    // Wait for physical shortcut modifiers to be released. Never switch to another window.
    let attempts=0;
    const attempt=()=>{
      if(Main.sessionMode.isLocked || global.display.focus_window!==target) return;
      const mask=Clutter.ModifierType.CONTROL_MASK | Clutter.ModifierType.SHIFT_MASK | Clutter.ModifierType.MOD1_MASK | Clutter.ModifierType.MOD4_MASK;
      if((global.get_pointer()[2] & mask)!==0) {if(++attempts<40) this._later(50,attempt);return;}
      const time=GLib.get_monotonic_time();
      this._virtualKeyboard.notify_keyval(time,Clutter.KEY_Control_L,Clutter.KeyState.PRESSED);
      this._virtualKeyboard.notify_keyval(time,Clutter.KEY_v,Clutter.KeyState.PRESSED);
      this._virtualKeyboard.notify_keyval(time,Clutter.KEY_v,Clutter.KeyState.RELEASED);
      this._virtualKeyboard.notify_keyval(time,Clutter.KEY_Control_L,Clutter.KeyState.RELEASED);
    };
    this._later(120,attempt);
    return 'paste_requested';
  }
  disable() {
    this._call('Cancel');this._alive=false;this._end();
    if(this._heartbeat) GLib.Source.remove(this._heartbeat);
    for(const id of this._sources) GLib.Source.remove(id);
    this._sources.clear();
    if(this._accelerator) {Main.wm.allowKeybinding(Meta.external_binding_name_for_action(this._accelerator),Shell.ActionMode.NONE);global.display.ungrab_accelerator(this._accelerator);}
    if(this._acceleratorSignal) global.display.disconnect(this._acceleratorSignal);
    if(this._sessionSignal) Main.sessionMode.disconnect(this._sessionSignal);
    if(this._proxy) {
      if(this._captureSignal) this._proxy.disconnectSignal(this._captureSignal);
      if(this._settingsSignal) this._proxy.disconnectSignal(this._settingsSignal);
      if(this._ownerSignal) this._proxy.disconnect(this._ownerSignal);
    }
    if(this._ownedName) Gio.bus_unown_name(this._ownedName);
    this._exported?.unexport();
    Main.layoutManager.removeChrome(this._pill);this._pill.destroy();this._indicator.destroy();
    this._proxy=null;this._target=null;this._virtualKeyboard=null;this._pill=null;this._indicator=null;this._accelerator=0;
  }
}
