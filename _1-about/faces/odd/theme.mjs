export const RETRO_COLORS=Object.freeze(['#cf542c','#188b91','#dfaa27','#788b36']);
export const RETRO=Object.freeze({paper:'#f0dab3',ink:'#302019',housing:'#38251e',brass:'#bf914f',letter:'#fff0c9',muted:'#f45b50'});
export const controlLane=action=>{
  const lane=/^(?:lane|assign|mute):(\d)$/.exec(action||'');if(lane)return +lane[1];
  const dial=['gain','tone','echo','rate'].indexOf((action||'').replace('dial:',''));if(dial>=0)return dial;
  return ({'dial:bass':0,'dial:reverb':1,'dial:drive':2,'dial:wow':3,play:3,reverse:1,stop:2,record:0,upload:1,loop:2,output:3,bell:0,console:1,audition:3,copy:1,remove:0,undo:2,'wind:1':1,'wind:5':2,'wind:-1':0,'wind:-5':3})[action]??0;
};
export function tint(color,amount=0){const rgb=/^#[\da-f]{6}$/i.test(color)?color:RETRO_COLORS[0];return '#'+[1,3,5].map(i=>{const v=parseInt(rgb.slice(i,i+2),16);return Math.round(amount<0?v*(1+amount):v+(255-v)*amount).toString(16).padStart(2,'0');}).join('');}
export function themeColors(settings={}){return RETRO_COLORS.map((color,i)=>/^#[\da-f]{6}$/i.test(settings['color'+(i+1)])?settings['color'+(i+1)]:color);}
export function applyThemeVariables(root,colors=RETRO_COLORS){for(let i=0;i<4;i++){root.style.setProperty('--odd-color-'+(i+1),colors[i]);root.style.setProperty('--odd-shade-'+(i+1),tint(colors[i],-.48));}root.style.setProperty('--odd-ivory',RETRO.letter);root.style.setProperty('--odd-paper',RETRO.paper);root.style.setProperty('--odd-ink',RETRO.ink);root.style.setProperty('--odd-housing',RETRO.housing);root.style.setProperty('--odd-brass',RETRO.brass);}

export const contrastGain=value=>{const c=Math.max(0,Math.min(1,Number.isFinite(value)?value:.5));return .08+(2.4-.08)*c*c*(3-2*c);};
