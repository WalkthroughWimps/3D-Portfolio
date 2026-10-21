export const MUTE_GLOW_RATIO=2/3;
export const MUTED_DETAIL_GLOW_RATIO=1/3;
// Canvas emissive maps are sRGB: encode the intended linear-light ratio.
export function scaleSrgbColor(color,ratio){
  const match=/^#([\da-f]{6})$/i.exec(color);if(!match)return color;
  const channels=[0,2,4].map(i=>parseInt(match[1].slice(i,i+2),16)/255);
  return '#'+channels.map(value=>{
    const linear=value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
    const scaled=linear*ratio,encoded=scaled<=.0031308?scaled*12.92:1.055*scaled**(1/2.4)-.055;
    return Math.round(encoded*255).toString(16).padStart(2,'0');
  }).join('');
}
export const MUTE_GLOW_BYTE=Math.round((1.055*MUTE_GLOW_RATIO**(1/2.4)-.055)*255);
