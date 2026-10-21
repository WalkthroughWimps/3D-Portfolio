// Raw map loading and sample/preset metadata only. Decoded buffers, synths and
// player selection remain session-owned. JS maps retain the existing Function
// execution requirement; this module does not weaken CSP or save any data.
export function normalizeSf2Name(name){
  if(!name) return '';
  return String(name).toUpperCase().replace(/\s+/g, '');
}

export function readFourCC(view, offset){
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

export function parseSf2PresetHeaders(view, start, size){
  const list = [];
  const recordSize = 38;
  const count = Math.floor(size / recordSize);
  for(let i=0;i<count;i++){
    const base = start + (i * recordSize);
    if(base + recordSize > view.byteLength) break;
    let name = '';
    for(let n=0;n<20;n++){
      const c = view.getUint8(base + n);
      if(c === 0) break;
      name += String.fromCharCode(c);
    }
    const preset = view.getUint16(base + 20, true);
    const bank = view.getUint16(base + 22, true);
    const trimmed = name.trim();
    if(trimmed && trimmed.toUpperCase() !== 'EOP'){
      list.push({ name: trimmed, preset, bank });
    }
  }
  return list;
}

export function extractSf2PresetList(arrayBuffer){
  if(!arrayBuffer) return [];
  try{
    const view = new DataView(arrayBuffer);
    if(view.byteLength < 12) return [];
    if(readFourCC(view, 0) !== 'RIFF') return [];
    let offset = 12;
    const end = view.byteLength;
    while(offset + 8 <= end){
      const id = readFourCC(view, offset);
      const size = view.getUint32(offset + 4, true);
      const chunkStart = offset + 8;
      const chunkEnd = chunkStart + size;
      if(id === 'LIST' && chunkStart + 4 <= end){
        const listType = readFourCC(view, chunkStart);
        if(listType === 'pdta'){
          let subOffset = chunkStart + 4;
          const subEnd = Math.min(chunkEnd, end);
          while(subOffset + 8 <= subEnd){
            const subId = readFourCC(view, subOffset);
            const subSize = view.getUint32(subOffset + 4, true);
            const subStart = subOffset + 8;
            if(subId === 'phdr'){
              return parseSf2PresetHeaders(view, subStart, subSize);
            }
            subOffset = subStart + subSize + (subSize % 2);
          }
        }
      }
      offset = chunkStart + size + (size % 2);
    }
  }catch(e){
    console.warn('[SF2] preset parse failed', e);
  }
  return [];
}

export function midiToNoteName(midiNum){
  const n = Number(midiNum);
  if(!Number.isFinite(n)) return null;
  const names = ['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];
  const octave = Math.floor(n / 12) - 1;
  const name = names[((n % 12) + 12) % 12];
  return `${name}${octave}`;
}

export function noteNameToMidi(name){
  if(!name || typeof name !== 'string') return null;
  const m = name.match(/^([A-Ga-g])([#sbf]?)(-?\d+)$/);
  if(!m) return null;
  const letter = m[1].toUpperCase();
  const base = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 }[letter];
  if(base == null) return null;
  const accidental = m[2].toLowerCase();
  const sharp = (accidental === '#' || accidental === 's') ? 1 : 0;
  const flat = (accidental === 'b' || accidental === 'f') ? -1 : 0;
  const octave = Number(m[3]);
  if(!Number.isFinite(octave)) return null;
  return (octave + 1) * 12 + base + sharp + flat;
}

export function buildSoundfontNoteIndex(map){
  if(!map || map._noteList) return;
  const entries = [];
  Object.keys(map).forEach(key => {
    const midi = noteNameToMidi(key);
    if(Number.isFinite(midi)) entries.push({ name: key, midi });
  });
  entries.sort((a,b)=>a.midi - b.midi);
  map._noteList = entries;
}

export function computeSampleRangeFromMap(map){
  if(!map) return null;
  buildSoundfontNoteIndex(map);
  const list = map._noteList || [];
  if(!list.length) return null;
  return { min: list[0].midi, max: list[list.length - 1].midi };
}

export function findNearestSoundfontKey(map, midiNum){
  if(!map) return null;
  const exact = midiToNoteName(midiNum);
  if(exact && map[exact]) return exact;
  buildSoundfontNoteIndex(map);
  if(!map._noteList || !map._noteList.length) return null;
  let best = map._noteList[0];
  let bestDist = Math.abs(best.midi - midiNum);
  for(let i=1;i<map._noteList.length;i++){
    const cur = map._noteList[i];
    const dist = Math.abs(cur.midi - midiNum);
    if(dist < bestDist){
      best = cur; bestDist = dist;
      if(bestDist === 0) break;
    }
  }
  return best ? best.name : null;
}

export async function loadMusyngKiteSoundfont(url, instrumentKey){
  const res = await fetch(url);
  if(!res.ok) throw new Error(`Soundfont mapping fetch failed: ${res.status} ${url}`);
  const jsText = await res.text();
  const getMap = new Function(`
    "use strict";
    // Use var so MusyngKite's own "var MIDI" statements don't cause a redeclare syntax error.
    var MIDI = { Soundfont: {} };
    ${jsText}
    return (MIDI && MIDI.Soundfont && MIDI.Soundfont["${instrumentKey}"]) || null;
  `);
  try{
    return getMap();
  }catch(e){
    console.error("[Soundfont] mapping eval failed", { url, instrumentKey, err: e });
    throw e;
  }
}

export function decodeDataUriToArrayBuffer(uri){
  const comma = uri.indexOf(',');
  const header = comma >= 0 ? uri.slice(0, comma) : '';
  const data = comma >= 0 ? uri.slice(comma + 1) : uri;
  if(!header.includes('base64')) return null;
  const binary = atob(data);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for(let i=0;i<len;i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function loadSoundfontMapFromJs(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error(`Soundfont mapping fetch failed: ${res.status} ${url}`);
  const jsText = await res.text();
  const getMap = new Function(`
    "use strict";
    var MIDI = { Soundfont: {} };
    ${jsText}
    if(!MIDI || !MIDI.Soundfont) return null;
    const keys = Object.keys(MIDI.Soundfont);
    const key = keys[0] || null;
    return key ? { key, map: MIDI.Soundfont[key] } : null;
  `);
  try{
    return getMap();
  }catch(e){
    console.error("[Soundfont] mapping eval failed", { url, err: e });
    throw e;
  }
}
