import {applyContrastVariables} from './contrast-style.mjs?v=contrast-glows-1';
import {reelAngle} from './ribbon-path.mjs?v=addon-layout-2';
import {snapTapePosition} from './tape-bed.mjs?v=bed-1';
import {blendWindow,clipBand,drawClipWaveform} from './clip-appearance.mjs?v=contrast-glows-1';
import {snapClipStart,proposeClipEdge} from './clip-gesture.mjs?v=clip-reverse-2';
import {createAudioEngine, LIMITS, duration, sourceSeconds} from './audio-engine.mjs?v=transport-ticks-1';
import {getSharedSettings} from '../../../_7-shared-scripts/core/settings.js';
import {RETRO_COLORS,applyThemeVariables,controlLane} from './theme.mjs?v=contrast-glows-1';
import {cloneClip,visibleInterval,placementPlan,validClip} from './clip-layout.mjs?v=panel-custom-1';
import {createOverlapDialog} from './overlap-dialog.mjs?v=capture-blend-1';

const time=value=>(value<0?'−':'')+`${Math.floor(Math.abs(value)/60).toString().padStart(2,'0')}:${(Math.abs(value)%60).toFixed(1).padStart(4,'0')}`;
const VOLUME_KEY = 'site.about.odd.volume';
const dial = (key, title, min, max, step, value) => `<label class="odd-dial" data-dial="${key}"><span>${title}</span><span class="odd-knob" aria-hidden="true"><i></i></span><input aria-label="${title}" type="range" data-control="${key}" min="${min}" max="${max}" step="${step}" value="${value}"><output></output></label>`;

export function createSoundDeck({onChange = () => {}, onClose = () => {},onStatus=()=>{}, standalone = false, hostDriven = false} = {}) {
  const colors = [...RETRO_COLORS];
  let selected = null, lane = 0, windowStart = 0, suspended = false, disposed = false, animation = 0, lastTick = 0, lastPosition = 0, stackBlends = true;
  const input = new AbortController(),overlap=createOverlapDialog({onClose:()=>render()});let clipboard=null;
  const root = document.createElement('section'); root.className = 'odd-deck'; root.setAttribute('aria-label', 'Oddio tape machine');
  applyThemeVariables(root,colors);
  root.innerHTML = `
    <div class="odd-case-screw odd-screw-a" aria-hidden="true">⊖</div><div class="odd-case-screw odd-screw-b" aria-hidden="true">⊖</div>
    <header class="odd-title"><div><p class="odd-eyebrow">DEPARTMENT OF CURIOUS NOISES</p><h1>Oddio</h1></div><div class="odd-model">MAGNETIC PLAYGROUND<br><b>FOUR VOICES · ONE LITTLE REEL</b></div>${standalone ? '' : '<button class="odd-close" data-action="close" aria-label="Close sound machine">×</button>'}</header>
    <div class="odd-load-state" hidden><progress aria-label="Preparing audio"></progress><output data-load-label></output><span data-load-elapsed></span><button data-action="cancel-load">CANCEL LOADING</button></div>
    <div class="odd-reel-bay" aria-hidden="true"><div class="odd-reel"><i></i><i></i><i></i><b></b></div><div class="odd-tape-path"></div><div class="odd-meter"><small>GOOD VIBRATIONS</small><div class="odd-meter-scale">−20 &nbsp; −10 &nbsp; 0 &nbsp; +3</div><i></i><b>VU</b></div><div class="odd-reel odd-take-up"><i></i><i></i><i></i><b></b></div><span class="odd-reel-caption">SUPPLY</span><span class="odd-reel-caption odd-caption-right">TAKE-UP</span></div>
    <div class="odd-transport"><div class="odd-keys"><button data-action="rewind" aria-label="Rewind to start">↤<small>REWIND</small></button><button data-action="play" aria-label="Play or pause reel">▶<small>PLAY REEL</small></button><button data-action="reverse" aria-label="Play backwards">◀<small>REVERSE</small></button><button data-action="stop">■<small>STOP</small></button><button data-action="record" class="odd-record">●<small>RECORD MIC</small></button><button data-action="upload">↥<small>FEED AUDIO</small></button><input class="odd-file" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm" aria-label="Import audio file" hidden></div><div class="odd-clock"><output data-time>00:00.0</output><span> / 01:00</span><button class="odd-clip-reverse" data-action="reverse-clip" aria-label="Reverse selected clip" aria-pressed="false" disabled>REV</button><label><input type="checkbox" data-control="loop"> LOOP REEL</label><button class="odd-output-switch" data-action="output" aria-label="Mute audio output" aria-pressed="false">◉ OUTPUT ON</button></div></div>
    <label class="odd-page-volume"><span>ODDIO PAGE VOLUME<small>Independent of the other pages</small></span><input aria-label="Oddio page volume" data-control="volume" type="range" min="0" max="200" step="5" value="100"><output data-volume>100%</output><span class="odd-volume-hint">0 — 200%<small>Extra gain for quieter recordings</small></span></label>
    <div class="odd-tape-header"><span>THE FABRIC TAPE BED</span><span data-stock>00 / ${LIMITS.clips} STRIPS</span><span>15 SEC WINDOW · 60 SEC REEL</span></div>
    <div class="odd-timeline"><div class="odd-ruler"><span data-ruler></span></div>${Array.from({length: 4}, (_, i) => `<div class="odd-lane" style="--lane-color:${colors[i]}"><div class="odd-lane-label"><button data-lane="${i}" aria-label="Select lane ${i + 1}" aria-pressed="${i === 0}"><b>0${i + 1}</b><span>VOICE</span></button><button data-mute="${i}" aria-label="Mute lane ${i + 1}" aria-pressed="false">M</button></div><div class="odd-lane-window" data-lane-window="${i}"><div class="odd-strips"></div><div class="odd-lane-empty">${i === 0 ? 'A LITTLE SPACE FOR A LITTLE NOISE' : '—'}</div></div></div>`).join('')}<div class="odd-playhead" aria-hidden="true"><i></i></div></div>
    <label class="odd-shuttle"><span>↶ WIND THE REEL</span><input aria-label="Tape position in seconds" type="range" data-control="position" min="-7.5" max="67.5" step=".1" value="0"><span>−7.5 — 67.5 SEC ↷</span></label>
    <div class="odd-edit-bay"><section class="odd-strip-editor"><div class="odd-section-title">01 / THE LABEL & THE SCISSORS</div><label class="odd-name">TAPE LABEL<input data-field="name" aria-label="Tape label" maxlength="64" placeholder="Record or feed a sound" disabled></label><div class="odd-edit-fields"><label>LANE<select data-field="lane" aria-label="Strip lane" disabled>${Array.from({length: 4}, (_, i) => `<option value="${i}">0${i + 1}</option>`).join('')}</select></label><label>PLACE AT<input type="number" data-field="start" aria-label="Strip start in seconds" min="-60" max="120" step=".1" disabled></label><label>TRIM IN<input type="number" data-field="in" aria-label="Trim in seconds" min="0" max="30" step=".01" disabled></label><label>TRIM OUT<input type="number" data-field="out" aria-label="Trim out seconds" min=".01" max="30" step=".01" disabled></label></div><div class="odd-strip-actions"><button data-action="audition" disabled>▷ AUDITION STRIP</button><button data-action="copy" disabled>⧉ DUPLICATE</button><button data-action="copy-buffer" disabled>COPY</button><button data-action="paste" disabled>PASTE</button><button data-action="partner" disabled>SELECT PARTNER</button><button data-action="remove" disabled>✂ REMOVE</button><button data-action="split" disabled>✂ SPLIT</button><button data-action="join" disabled>↔ JOIN NEXT</button><button data-action="undo" disabled>↶ UNDO</button><button data-action="redo" disabled>↷ REDO</button></div><p class="odd-small">Select a strip. Drag it along the tape, or place and trim it with the counters.</p></section><section class="odd-effects"><div class="odd-section-title">02 / THE SOUND OF <span data-lane-title>VOICE 01</span></div><div class="odd-dials">${dial('gain', 'CLIP GAIN', 0, 1, .01, .7)}${dial('tone', 'TONE', 200, 18000, 100, 18000)}${dial('echo', 'ECHO', 0, 1, .01, 0)}${dial('rate', 'SPEED', .5, 2, .05, 1)}${dial('bass', 'BASS CUT', 20, 2000, 20, 20)}${dial('reverb', 'SPRING', 0, 1, .01, 0)}${dial('drive', 'DRIVE', 0, 1, .01, 0)}${dial('wow', 'WOW', 0, 1, .01, 0)}</div><p class="odd-small">Gain and speed follow the selected clip. Cylinders set track volume; other effects follow the voice. Split at the playhead; join with the next touching clip.</p></section></div>
    <section class="odd-file-bay" aria-label="Session and audio files"><div class="odd-section-title">03 / THE SESSION & THE SOUVENIR</div><div class="odd-file-actions"><button data-action="save">SAVE SESSION</button><button data-action="open-session">OPEN SESSION</button><input class="odd-session-file" type="file" accept=".oddio,.json,application/json" aria-label="Open Oddio session" hidden><button data-action="export-mix">MIX WAV</button><button data-action="export-clip" disabled>CLIP WAV</button></div><fieldset class="odd-export-options"><legend>WAV OPTIONS</legend><label><input type="checkbox" data-export="effects" checked>Voice effects & mutes</label><label><input type="checkbox" data-export="tails" checked>Two-second effect tail</label><label><input type="checkbox" data-export="applyVolume" checked>Page volume</label></fieldset><p class="odd-small">Save embeds the audio. Open replaces this deck. WAV exports ignore monitor mute; turn off effects for the dry sound.</p></section>
    <footer class="odd-footer"><button data-action="bell" title="Print a two-second synthesized bell">✧ PRINT A TEST BELL</button><p role="status" aria-live="polite" data-status>Ready when you are. Feed a file, or record something peculiar.</p><span>LOCAL AUDIO · SAVE TO KEEP</span></footer>
    <p class="odd-spec">4 voices · ${LIMITS.clips} strips · 30 sec per sound · 120 sec source storage (copies share audio) · files up to 20 MB · mixed to mono. Audio stays local. Save a session before reloading to keep it. Undo/redo retains up to 20 clip edits within a bounded audio-memory budget.</p>`;
  const query = selector => root.querySelector(selector);
  root.querySelectorAll('.odd-strips').forEach(node=>{for(const[time,label]of[[0,'start'],[60,'end']]){const seam=document.createElement('span');seam.className='odd-boundary odd-boundary-'+label;seam.style.left=time/15*100+'%';seam.title=label+' of playable range';node.append(seam);}});
  query('[data-control="position"]').addEventListener('change',()=>engine.seek(snapTapePosition(engine.targetPosition)),{signal:input.signal});

  let statusKind='info';
  const message = (text,kind='info') => {const node=query('[data-status]');if(node.textContent===text&&statusKind===kind)return;node.textContent=text;statusKind=kind;onStatus(text,kind);};
  const engine = createAudioEngine((error, clip) => { if (disposed) return;if(engine.capturePreview)lane=engine.capturePreview.lane;if(engine.loading)message(`${engine.loading.stage}: ${engine.loading.name}`,'loading'); if (clip) { selected = clip.id; lane = clip.lane; message(`Printed “${clip.name}”. Your new strip is on voice ${lane + 1}.`); } if (error) message(error,'error'); render();if(engine.capturePending&&!overlap.openState)showCaptureConflict(); });
  function showCaptureConflict(){overlap.open({title:'Choose how this capture fits',allowed:['replace','blend'],evaluate:choice=>engine.planCapture(choice),apply:choice=>{const c=engine.resolveCapture(choice);if(c){select(c);message(`Printed “${c.name}” on voice ${c.lane+1}.`);}},onCancel:()=>{engine.cancelCapture();message('Capture discarded.');}});}
  const syncControlColors=()=>root.querySelectorAll('[data-action],.odd-dial').forEach(node=>{const lane=controlLane(node.dataset.action||`dial:${node.dataset.dial}`);node.style.setProperty('--control-color',colors[lane]);node.style.setProperty('--control-shade',`color-mix(in srgb, ${colors[lane]} 55%, #302019)`);});
  const stopSync = getSharedSettings().subscribe(snapshot => {engine.setSyncOffsetMs(snapshot.audio.syncMs);applyContrastVariables(root,snapshot.start.contrast);root.style.setProperty('--yarn-highlight',snapshot.about.odd.highlightColor);let changed=stackBlends!==snapshot.about.odd.stackBlends;stackBlends=snapshot.about.odd.stackBlends;root.querySelectorAll('.odd-lane').forEach((node,i)=>{const next=snapshot.about.odd['color'+(i+1)]||RETRO_COLORS[i];changed||=colors[i]!==next;colors[i]=next;node.style.setProperty('--lane-color',next);});applyThemeVariables(root,colors);syncControlColors();if(changed)queueMicrotask(()=>{if(!disposed)render();});}, {immediate: true});
  let drag = null;
  const downloads=new Set();
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');downloads.add(url);a.href=url;a.download=name;a.click();setTimeout(()=>{URL.revokeObjectURL(url);downloads.delete(url);},1000);}
  const exportOptions=()=>Object.fromEntries([...root.querySelectorAll('[data-export]')].map(f=>[f.dataset.export,f.checked]));
  try { const saved = localStorage.getItem(VOLUME_KEY); if (saved !== null && Number.isFinite(Number(saved))) engine.setMaster(Number(saved)); } catch { /* Keep the page control usable without storage. */ }
  function clip() { return engine.clips.find(c => c.id === selected); }
  function select(c) { selected = c.id; lane = c.lane; render(); }
  async function action(work) { try { await work(); } catch (error) { message(error.message,error.name==='AbortError'?'info':'error'); render(); } }
  function controlsLocked() { return engine.recording || engine.pending || engine.busy || Boolean(engine.capturePending) || overlap.openState; }
  function render() {
    if (disposed) return;
    const current = clip(), locked = controlsLocked();
    const load=engine.loading,loadBox=query('.odd-load-state');loadBox.hidden=!load&&statusKind!=='error';root.setAttribute('aria-busy',String(Boolean(load)));
    loadBox.classList.toggle('odd-load-error',!load&&statusKind==='error');loadBox.querySelector('progress').hidden=!load;query('[data-load-label]').textContent=load?`${load.stage}: ${load.name}`:query('[data-status]').textContent;query('[data-action="cancel-load"]').hidden=!load;
    if(!load)query('[data-load-elapsed]').textContent='';
    root.classList.toggle('odd-is-running', engine.playing || engine.recording || engine.winding);
    root.classList.toggle('odd-is-recording', engine.recording);
    query('[data-stock]').textContent = `${LIMITS.clips-engine.clips.length} LEFT · ${engine.clips.length} / ${LIMITS.clips} STRIPS · ${sourceSeconds(engine.clips).toFixed(0)} / 120s SOURCE`;
    query('[data-action="record"]').innerHTML = `●<small>${engine.recording ? 'PRINT & STOP' : engine.capturePreview?.preparing?'ARMING…':engine.pending ? 'ALLOW MIC…' : 'RECORD MIC'}</small>`;
    query('[data-action="record"]').disabled = engine.pending || engine.busy;
    query('[data-action="record"]').setAttribute('aria-pressed', String(engine.recording));query('[data-action="play"]').innerHTML=engine.playing&&engine.direction>0?'Ⅱ<small>PAUSE</small>':'▶<small>PLAY REEL</small>';query('[data-action="play"]').setAttribute('aria-pressed',String(engine.playing&&engine.direction>0));query('[data-action="reverse"]').setAttribute('aria-pressed',String(engine.playing&&engine.direction<0));query('[data-action="reverse"]').innerHTML=engine.playing&&engine.direction<0?'Ⅱ<small>PAUSE</small>':'◀<small>REVERSE</small>';
    for (const name of ['play', 'reverse','rewind', 'bell', 'upload','save','open-session']) query(`[data-action="${name}"]`).disabled = locked;
    query('[data-action="export-mix"]').disabled=locked||!engine.clips.length;
    const reverseClip=query('[data-action="reverse-clip"]');reverseClip.disabled=!current||locked;reverseClip.setAttribute('aria-pressed',String(Boolean(current?.reversed)));reverseClip.setAttribute('aria-label',current?.reversed?'Restore selected clip forward':'Reverse selected clip');reverseClip.textContent='REV';
    query('[data-control="position"]').disabled = locked;
    for (const name of ['audition', 'copy','copy-buffer', 'remove','split','join','export-clip']) query(`[data-action="${name}"]`).disabled = !current || locked;
    query('[data-action="undo"]').disabled = !engine.canUndo || locked;
    query('[data-action="redo"]').disabled = !engine.canRedo || locked;query('[data-action="paste"]').disabled=!clipboard||locked;query('[data-action="partner"]').disabled=!current?.links?.length||locked;
    query('[data-control="loop"]').checked=engine.loop;
    query('[data-lane-title]').textContent = `VOICE 0${lane + 1}`;
    const output = query('[data-action="output"]'); output.textContent = engine.muted ? '◌ OUTPUT MUTED' : '◉ OUTPUT ON'; output.setAttribute('aria-pressed', String(engine.muted)); output.setAttribute('aria-label', engine.muted ? 'Unmute audio output' : 'Mute audio output');
    query('[data-control="volume"]').value = Math.round(engine.volume * 100); query('[data-volume]').textContent = `${Math.round(engine.volume * 100)}%`;
    query('[data-control="volume"]').setAttribute('aria-valuetext', `${Math.round(engine.volume * 100)} percent, this page only`);
    output.title = engine.siteMuted ? 'The site-wide mute is also active. Unmute it in General Settings to hear audio.' : 'Mute this sound machine';
    if (engine.siteMuted) output.textContent = '◌ SITE MUTED';
    root.querySelectorAll('[data-lane]').forEach(button => { button.setAttribute('aria-pressed', String(+button.dataset.lane === lane)); });
    root.querySelectorAll('.odd-lane').forEach((node,i)=>{node.dataset.selected=String(i===lane);node.dataset.muted=String(engine.lanes[i].muted);});
    root.querySelectorAll('[data-mute]').forEach(button => { button.setAttribute('aria-pressed', String(engine.lanes[+button.dataset.mute].muted)); });
    root.querySelectorAll('[data-field]').forEach(field => {
      field.disabled = !current || locked;
      if (document.activeElement !== field) field.value = current ? current[field.dataset.field] : '';
    });
    for (const key of ['gain', 'tone', 'echo', 'rate','bass','reverb','drive','wow']) {
      const field = query(`[data-control="${key}"]`), value = key === 'rate' ? current?.rate ?? 1 : key==='gain'?current?.gain??1:engine.lanes[lane][key];
      field.value = value; field.disabled = locked || ['gain','rate'].includes(key) && !current; updateDial(field);
    }
    // Preserve each strip node across selection, so keyboard focus and drag capture survive.
    const ids = new Set(engine.clips.map(c => c.id));
    root.querySelectorAll('[data-clip]').forEach(node => { if (!ids.has(node.dataset.clip)) node.remove(); });
    for (const c of engine.clips) {
      let node = root.querySelector(`[data-clip="${c.id}"]`);
      if (!node) { node = document.createElement('button'); node.className = 'odd-strip'; node.dataset.clip = c.id; node.innerHTML = '<span></span><canvas width="300" height="30" aria-hidden="true"></canvas>'; }
      query(`[data-lane-window="${c.lane}"] .odd-strips`).append(node);
      node.style.left = `${c.start / 15 * 100}%`; node.style.width = `${duration(c) / 15 * 100}%`;
      node.setAttribute('aria-label', `${c.name}, voice ${c.lane + 1}, starts ${c.start.toFixed(1)} seconds, duration ${duration(c).toFixed(1)} seconds${c.reversed?', reversed':''}`);
      node.setAttribute('aria-pressed', String(c.id === selected));const band=clipBand(c,engine.clips,stackBlends),blended=Boolean(blendWindow(c,engine.clips)?.peer);node.dataset.blended=String(blended);node.dataset.overlap=String(blended&&!stackBlends);node.dataset.muted=String(engine.lanes[c.lane].muted);node.style.top=`${5+band.top*41}px`;node.style.height=`${band.height*41}px`;node.style.zIndex=c.id===selected?'3':'1';const window=visibleInterval(c,engine.clips,{playable:false}),full=duration(c);node.style.clipPath='inset(0 '+Math.max(0,(c.start+full-window.end)/full*100)+'% 0 '+Math.max(0,(window.start-c.start)/full*100)+'%)';node.disabled=locked;
      node.firstElementChild.textContent = `${c.reversed?'↶ ':''}${c.name}`;
      const blend=blendWindow(c,engine.clips),start=blend?(blend.start-c.start)/full*100:0,end=blend?(blend.end-c.start)/full*100:0;node.style.setProperty('--blend-start',start+'%');node.style.setProperty('--blend-end',end+'%');drawClipWaveform(node.querySelector('canvas').getContext('2d'),c,engine.clips,300,30,{color:colors[c.lane],muted:engine.lanes[c.lane].muted,stackBlends});
    }
    root.querySelectorAll('[data-lane-window]').forEach(node => { node.querySelector('.odd-lane-empty').hidden = engine.clips.some(c => c.lane === +node.dataset.laneWindow); });
    positionUI(engine.tick().position); onChange();
  }
  function updateDial(field) {
    const value = +field.value, ratio = (value - +field.min) / (+field.max - +field.min);
    field.closest('.odd-dial').style.setProperty('--dial-angle', `${-135 + ratio * 270}deg`);
    const text = ['tone','bass'].includes(field.dataset.control) ? value>=1000?`${(value / 1000).toFixed(1)} kHz`:`${value} Hz` : field.dataset.control === 'rate' ? `${value.toFixed(2)}×${field.dataset.previewReversed==='true'||field.dataset.previewReversed===undefined&&clip()?.reversed?' REV':''}` : `${Math.round(value * 100)}%`;
    field.closest('.odd-dial').querySelector('output').textContent = text;
    field.setAttribute('aria-valuetext', text);
  }
  function setVolume(value) { engine.setMaster(value); try { localStorage.setItem(VOLUME_KEY, String(engine.volume)); } catch { /* Session control still works. */ } }
  function positionUI(position) {
    lastPosition = position; windowStart = position-7.5;
    root.querySelectorAll('.odd-reel').forEach((node,i)=>{node.style.animation='none';node.style.transform='rotate('+reelAngle(position,i===1)+'rad)';});
    query('[data-time]').textContent = time(position);
    query('[data-control="position"]').value = position;
    root.querySelectorAll('.odd-strips').forEach(node => { node.style.transform = `translateX(${-windowStart / 15 * 100}%)`; });
    query('.odd-playhead').style.left = `calc(64px + (100% - 64px) * ${(position - windowStart) / 15})`;
    query('[data-ruler]').innerHTML = Array.from({length: 4}, (_, i) => `<b>${(windowStart + i * 5).toFixed(1)}s</b>`).join('');
    query('.odd-meter').style.setProperty('--needle', `${-50 + Math.min(1, engine.getLevel() * 6) * 100}deg`);
  }
  root.addEventListener('click', event => {
    const target = event.target.closest('button'); if (!target) return;
    if (target.dataset.clip) { const current = engine.clips.find(c => c.id === target.dataset.clip); if (current) select(current); return; }
    if (target.dataset.lane !== undefined) { lane = +target.dataset.lane; render(); return; }
    if (target.dataset.mute !== undefined) { const index = +target.dataset.mute; engine.setLane(index, {muted: !engine.lanes[index].muted}); return; }
    void action(async () => {
      switch (target.dataset.action) {
        case 'output': engine.setMuted(!engine.muted); message(engine.muted ? 'Output muted. The tape can still roll silently.' : 'Output on.'); break;
        case 'close': onClose(); break;
        case 'play': if(await engine.play(null,false))message('The reel is rolling.');else message('Paused.'); break;
        case 'reverse': if(await engine.playReverse())message('The reel is playing backwards.');else message('Paused.');break;
        case 'reverse-clip': if(clip()){const next=engine.edit(selected,{reversed:!Boolean(clip().reversed)});message(next.reversed?'Selected clip plays in reverse.':'Selected clip plays forward.');}break;
        case 'stop': engine.cancelLoad();engine.stopRecording();await engine.stop();message('Stopped.'); break;
        case 'cancel-load': engine.cancelLoad();break;
        case 'rewind': engine.seek(0); message('Rewinding to the leader.'); break;
        case 'record': if (engine.recording) { engine.stopRecording(); message('Printing your recording…'); } else { await engine.record(lane); if (engine.recording) message('Recording microphone · up to 30 seconds. Press the red key to print.'); } break;
        case 'upload': query('.odd-file').click(); break;
        case 'audition': if(clip()){if(engine.playing||engine.playbackPending)engine.pause();await engine.play(clip());} break;
        case 'copy-buffer': copyClipboard();break;
        case 'paste': pasteClipboard();break;
        case 'partner': {const peer=engine.clips.find(c=>c.id===clip()?.links?.[0]?.peer);if(peer)select(peer);break;}
        case 'copy': if(clip()){const copy=engine.duplicate(selected);select(copy);message('Copied the strip to a clear stretch of tape.');} break;
        case 'remove': if (clip()) { engine.remove(selected); selected = null; render(); message('Strip removed. Undo brings it back.'); } break;
        case 'undo': if(engine.undo()){selected=engine.clips.some(c=>c.id===selected)?selected:engine.clips.at(-1)?.id??null;lane=clip()?.lane??lane;render();message('Undid the last clip edit.');} break;
        case 'redo': if(engine.redo()){selected=engine.clips.some(c=>c.id===selected)?selected:engine.clips.at(-1)?.id??null;lane=clip()?.lane??lane;render();message('Redid the clip edit.');} break;
        case 'split': if(clip()){const right=engine.split(selected,engine.tick().position);select(right);message('Split at the playhead. Both pieces share their source audio.');} break;
        case 'join': if(clip()){const joined=await engine.join(selected);select(joined);message('Joined this clip to the next touching clip on its voice.');} break;
        case 'save': download(engine.saveSession({selected,colors:Array.from({length:4},(_,i)=>getSharedSettings().get().about.odd['color'+(i+1)])}),'Oddio session.oddio');message('Saved the audio, clip edits, voice effects and colors in one session file.');break;
        case 'open-session': query('.odd-session-file').click();break;
        case 'export-mix': case 'export-clip': {const current=target.dataset.action==='export-clip'?clip():null,blob=await engine.exportWav({...exportOptions(),clipId:current?.id??null});download(blob,(current?.name??'Oddio mix').replace(/[<>:"/\\|?*]/g,'_')+'.wav');message('Exported a mono 24 kHz WAV. Monitor mute does not silence the file.');break;}
        case 'bell': { const c = await engine.bell(lane); if (c) { select(c); message('Printed a brass moon bell at the playhead.'); } break; }
      }
    });
  }, {signal: input.signal});
  query('.odd-session-file').addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;void action(async()=>{const extra=await engine.loadSession(file);if(Array.isArray(extra?.colors))extra.colors.slice(0,4).forEach((value,i)=>{if(/^#[0-9a-f]{6}$/i.test(value))getSharedSettings().patch({about:{odd:{['color'+(i+1)]:value}}});});selected=engine.clips.some(c=>c.id===extra?.selected)?extra.selected:engine.clips[0]?.id??null;lane=clip()?.lane??0;render();message('Opened the session. Your previous deck was replaced.');});},{signal:input.signal});
  query('.odd-file').addEventListener('change', event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    message(`Reading file: ${file.name}`,'loading');
    void action(async () => { const c = await engine.importFile(file, lane); if (c) { select(c); message(`Printed “${c.name}”.`); } });
  }, {signal: input.signal});
  root.addEventListener('change', event => {
    const field = event.target, key = field.dataset.field; if (!key || !clip()) return;
    void action(()=>{editSelected({[key]:key==='name'?field.value.trim()||'Untitled strip':+field.value});field.value=clip()?.[key]??'';render();});
  }, {signal: input.signal});
  root.addEventListener('input', event => {
    const field = event.target, key = field.dataset.control; if (!key) return;
    if (key === 'loop') { engine.loop = field.checked; return; }
    if (key === 'volume') { setVolume(+field.value / 100); return; }
    if (key === 'position') { engine.seek(+field.value); return; }
    void action(() => { if (key === 'rate'||key==='gain') { if (clip()) editSelected({[key]: +field.value}); } else engine.setLane(lane, {[key]: +field.value}); updateDial(field); });
  }, {signal: input.signal});
  function copyClipboard(){if(!clip())return;clipboard=cloneClip(clip());clipboard.links=[];message('Copied the clip. Paste places it at the playhead on the selected voice.');render();}
  function clearEdgeHover(){root.querySelectorAll('.odd-strip[data-edge-hover]').forEach(node=>delete node.dataset.edgeHover);}
  function cancelDrag(){clearEdgeHover();const node=drag?.strip||drag?.field||drag?.tape,pointer=drag?.pointer,preview=drag?.preview;if(drag?.strip)drag.strip.classList.remove('odd-drag-source');preview?.remove();drag=null;previewRate(null);if(node&&node.hasPointerCapture(pointer))node.releasePointerCapture(pointer);}
  function pasteClipboard(strategy=null){if(!clipboard||controlsLocked())return false;const patch={start:lastPosition,lane},candidate={...cloneClip(clipboard),id:crypto.randomUUID(),links:[],...patch},evaluate=choice=>placementPlan([...engine.clips,candidate],candidate.id,{}, {strategy:choice});try{const plan=evaluate(strategy);if(plan.conflict){cancelDrag();engine.pause();overlap.open({evaluate,apply:choice=>{const c=engine.paste(clipboard,patch,choice);select(c);message('Pasted the clip.');}});return false;}const c=engine.paste(clipboard,patch,strategy);select(c);message('Pasted the clip.');return true;}catch(error){message(error.message);return false;}}
  function handleShortcut(event){if(disposed||suspended||controlsLocked()||event.altKey||event.target?.closest?.('input,select,textarea,[contenteditable="true"]'))return false;const key=event.key.toLowerCase(),command=event.ctrlKey||event.metaKey;let handled=true;
    if(command&&key==='c')copyClipboard();else if(command&&key==='x'){if(clip()){copyClipboard();query('[data-action="remove"]').click();}}else if(command&&key==='v')pasteClipboard();else if(command&&key==='d')query('[data-action="copy"]').click();else if(command&&key==='z')query('[data-action="'+(event.shiftKey?'redo':'undo')+'"]').click();else if(command&&key==='y')query('[data-action="redo"]').click();else if(!command&&['delete','backspace'].includes(key))query('[data-action="remove"]').click();else if(!command&&key===' '){if(!event.repeat)query('[data-action="'+((engine.playing||engine.playbackPending)&&engine.direction<0?'reverse':'play')+'"]').click();}else if(!command&&key==='s')query('[data-action="split"]').click();else if(!command&&['arrowleft','arrowright','home','end'].includes(key))engine.seek(key==='home'?0:key==='end'?60:snapTapePosition(engine.targetPosition+(key==='arrowleft'?-1:1)*(event.shiftKey?1:5)));else handled=false;
    if(handled){event.preventDefault();event.stopImmediatePropagation();}return handled;
  }
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();cancelDrag();return;}if(handleShortcut(event))return;if(event.key==='Escape'&&!standalone)onClose();},{signal:input.signal});
  root.addEventListener('pointerdown', event => {
    const strip = event.target.closest('[data-clip]');
    if (strip && !strip.disabled && event.button === 0) {
      const c = engine.clips.find(item => item.id === strip.dataset.clip); select(c);
      const rect=strip.getBoundingClientRect(),window=visibleInterval(c,engine.clips,{playable:false}),left=Math.abs(window.start-c.start)<.001&&Math.abs(event.clientX-rect.left)<=9,right=Math.abs(window.end-c.start-duration(c))<.001&&Math.abs(event.clientX-rect.right)<=9;
      const edge=left?'start':right?'end':null;
      drag = {id: c.id, pointer: event.pointerId, x: event.clientX, start: c.start, width: strip.parentElement.parentElement.clientWidth, lane:c.lane, copy:!edge&&event.altKey, strip, edge, source:{...c}};
      strip.setPointerCapture(event.pointerId);
    }
    const bed=event.target.closest('[data-lane-window]');
    if(!strip&&bed&&event.button===0&&!controlsLocked()){drag={pointer:event.pointerId,tape:bed,x:event.clientX,start:lastPosition,width:bed.clientWidth};bed.setPointerCapture(event.pointerId);}
    const field = event.target.closest('.odd-dial input');
    if (field && !field.disabled && event.button === 0) {
      event.preventDefault(); field.focus(); field.setPointerCapture(event.pointerId);
      drag = {pointer: event.pointerId, field, y: event.clientY, value: +field.value};
    }
  }, {signal: input.signal});
  root.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId){const strip=event.target.closest?.('[data-clip]');root.querySelectorAll('.odd-strip[data-edge-hover]').forEach(node=>delete node.dataset.edgeHover);if(strip&&!strip.disabled){const c=engine.clips.find(item=>item.id===strip.dataset.clip),rect=strip.getBoundingClientRect(),window=c&&visibleInterval(c,engine.clips,{playable:false});if(c&&window){const left=Math.abs(window.start-c.start)<.001&&Math.abs(event.clientX-rect.left)<=9,right=Math.abs(window.end-c.start-duration(c))<.001&&Math.abs(event.clientX-rect.right)<=9;if(left||right)strip.dataset.edgeHover=left?'start':'end';}}return;}
    if(drag.tape){engine.seek(drag.start-(event.clientX-drag.x)/drag.width*15);return;}
    if (drag.field) {
      const f = drag.field, step = +f.step;
      f.value = Math.round(Math.min(+f.max, Math.max(+f.min, drag.value + (drag.y - event.clientY) / 150 * (+f.max - +f.min))) / step) * step;
      f.dispatchEvent(new Event('input', {bubbles: true}));
    } else {
      if(drag.edge){
        const time=drag.edge==='start'?drag.start+(event.clientX-drag.x)/drag.width*15:drag.start+duration(drag.source)+(event.clientX-drag.x)/drag.width*15;
        drag.edgePreview=proposeClipEdge(engine.clips,drag.source,drag.edge,time,{stretch:event.shiftKey});
        const candidate=drag.edgePreview.clip;
        if(!drag.preview){const ghost=drag.strip.cloneNode(true);ghost.removeAttribute('data-clip');ghost.removeAttribute('aria-pressed');ghost.removeAttribute('data-edge-hover');ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;ghost.classList.add('odd-drag-preview');drag.preview=ghost;drag.strip.classList.add('odd-drag-source');}
        drag.strip.parentElement.append(drag.preview);drag.preview.style.left=`${candidate.start/15*100}%`;drag.preview.style.width=`${duration(candidate)/15*100}%`;drag.preview.style.clipPath='none';drag.preview.dataset.valid=String(drag.edgePreview.valid);drag.preview.dataset.edgeHover=drag.edgePreview.edge;
        drawClipWaveform(drag.preview.querySelector('canvas').getContext('2d'),candidate,engine.clips,300,30,{color:colors[candidate.lane],muted:engine.lanes[candidate.lane].muted,stackBlends});
        previewRate(drag.edgePreview.stretch?candidate.rate:null,candidate.reversed);
        return;
      }
      const source=engine.clips.find(c=>c.id===drag.id),raw=drag.start+(event.clientX-drag.x)/drag.width*15,snap=source?snapClipStart(engine.clips,source,raw,lastPosition,{copy:drag.copy||event.altKey,tolerance:(event.shiftKey?12:8)/drag.width*15}):null,value=snap?.snapped?snap.start:Math.round(raw*10)/10;
      const over=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-lane-window]');drag.nextLane=over?+over.dataset.laneWindow:drag.lane;drag.copy=drag.copy||event.altKey;
      if(!drag.preview){const ghost=drag.strip.cloneNode(true);ghost.removeAttribute('data-clip');ghost.removeAttribute('aria-pressed');ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;ghost.classList.add('odd-drag-preview');const sourceCanvas=drag.strip.querySelector('canvas'),ghostCanvas=ghost.querySelector('canvas');ghostCanvas.getContext('2d').drawImage(sourceCanvas,0,0);drag.preview=ghost;drag.strip.classList.add('odd-drag-source');}
      const dest=query(`[data-lane-window="${drag.nextLane}"] .odd-strips`);dest.append(drag.preview);drag.preview.style.left=`${value/15*100}%`;drag.preview.style.width=drag.strip.style.width;drag.preview.style.clipPath='none';drag.preview.style.top='5px';drag.preview.style.height='41px';drag.preview.dataset.blended='false';if(source)drawClipWaveform(drag.preview.querySelector('canvas').getContext('2d'),{...source,start:value,lane:drag.nextLane,links:[]},[],300,30,{color:colors[drag.nextLane],muted:engine.lanes[drag.nextLane].muted});
      const candidate=source?{...source,start:value,lane:drag.nextLane}:null;const onBed=Boolean(over),valid=onBed&&candidate&&validClip(candidate)&&(!drag.copy||engine.clips.length<LIMITS.clips);drag.preview.dataset.valid=String(Boolean(valid));
      drag.next = value;
    }
  }, {signal: input.signal});
  function release(event, cancel = false) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const previous = drag; drag = null;clearEdgeHover();previous.preview?.remove();if(previous.strip)previous.strip.classList.remove('odd-drag-source');if(previous.tape&&!cancel)engine.seek(snapTapePosition(engine.targetPosition));previewRate(null);
    if(previous.edge){if(!cancel&&previous.edgePreview?.valid){const c=previous.edgePreview.clip;void action(()=>placeClip(previous.id,{start:c.start,in:c.in,out:c.out,rate:c.rate,reversed:c.reversed}));}render();return;}
    if (previous.strip) { if (!cancel && previous.next !== undefined&&previous.preview?.dataset.valid==='true') void action(() => { placeClip(previous.id, {start: previous.next,lane:previous.nextLane??previous.lane},previous.copy); }); render(); }
  }
  root.addEventListener('pointerleave',()=>{if(!drag)clearEdgeHover();},{signal:input.signal});
  root.addEventListener('pointerup', event => release(event), {signal: input.signal});
  root.addEventListener('pointercancel', event => release(event, true), {signal: input.signal});
  root.addEventListener('lostpointercapture', event => release(event, true), {signal: input.signal});
  function placeClip(id,patch,copy=false,strategy=null){if(controlsLocked())return false;try{const evaluate=choice=>engine.planPlacement(id,patch,{copy,strategy:choice}),plan=evaluate(strategy),apply=choice=>{const c=engine.place(id,patch,{copy,strategy:choice});if(c){select(c);message(copy?'Copied the woven clip.':'Placed the woven clip.');}};if(plan.conflict){cancelDrag();engine.pause();overlap.open({evaluate,apply});return false;}apply(strategy);return true;}catch(error){message(error.message);render();return false;}}
  function editSelected(patch){if(!clip()||controlsLocked())return false;if(Object.keys(patch).some(k=>['start','lane','in','out','rate'].includes(k)))return placeClip(selected,patch);try{const c=engine.edit(selected,patch);if(c)select(c);return Boolean(c);}catch(error){message(error.message);render();return false;}}
  function setControl(key,value){const field=query('[data-control="'+key+'"]');if(!field||field.disabled)return;field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));}
  function previewRate(rate,reversed){const field=query('[data-control="rate"]');if(!field)return;if(reversed===undefined)delete field.dataset.previewReversed;else field.dataset.previewReversed=String(Boolean(reversed));field.value=rate??clip()?.rate??1;updateDial(field);}
  function loadingTime(){const load=engine.loading;if(!load)return;const node=query('[data-load-elapsed]'),text=Math.floor((performance.now()-load.startedAt)/1000)+'s';if(node.textContent!==text)node.textContent=text;}
  function animate(now) { animation = 0; if (disposed || suspended) return; const frame=engine.tick(now);if (now - lastTick > 45||engine.winding||engine.playing||engine.recording) { lastTick = now;loadingTime(); positionUI(frame.position); onChange(); } animation = requestAnimationFrame(animate); }
  function resume() { if (disposed) return; suspended = false; if (!hostDriven && !animation) animation = requestAnimationFrame(animate); }
  render(); resume();
  return {root, engine, handleShortcut, setVolume, message, placeClip, editSelected, setControl, previewRate, selectClip(id){const c=engine.clips.find(c=>c.id===id);if(c)select(c);},selectLane(value){lane=value;render();},get locked(){return controlsLocked();},get status(){return query('[data-status]').textContent;}, tick() { if(suspended||disposed)return;const now=performance.now(),frame=engine.tick(now);loadingTime();if(now-lastTick>45||engine.winding||engine.playing||engine.recording){lastTick=now;positionUI(frame.position);} }, get selected() {return selected;}, get lane() {return lane;}, get position() {return lastPosition;},
    suspend() { suspended = true;cancelDrag();overlap.close(); engine.suspend(); if (animation) cancelAnimationFrame(animation); animation = 0; }, resume,
    dispose() { if (disposed) return; disposed = true; stopSync();overlap.dispose();clipboard=null; engine.dispose(); input.abort(); cancelAnimationFrame(animation);downloads.forEach(url=>URL.revokeObjectURL(url));downloads.clear(); root.remove(); }
  };
}
