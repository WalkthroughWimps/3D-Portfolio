// Canvas-only icons shared by the face and its flat configuration sketch.
const W=128,H=96;
export function drawPodIcon(ctx,action,color='#ffffff'){
  ctx.clearRect(0,0,W,H);ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=7;ctx.lineCap='round';ctx.lineJoin='round';
  const line=(...points)=>{ctx.beginPath();ctx.moveTo(points[0],points[1]);for(let i=2;i<points.length;i+=2)ctx.lineTo(points[i],points[i+1]);ctx.stroke();};
  const poly=(...points)=>{ctx.beginPath();ctx.moveTo(points[0],points[1]);for(let i=2;i<points.length;i+=2)ctx.lineTo(points[i],points[i+1]);ctx.closePath();ctx.fill();};
  const rect=(x,y,w,h)=>ctx.fillRect(x,y,w,h);
  const circle=(x,y,r,fill=false)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);fill?ctx.fill():ctx.stroke();};
  const arc=(x,y,r,start,end,ccw=false)=>{ctx.beginPath();ctx.arc(x,y,r,start,end,ccw);ctx.stroke();};
  const arrow=(x1,y1,x2,y2,size=11)=>{line(x1,y1,x2,y2);const angle=Math.atan2(y2-y1,x2-x1);poly(x2,y2,x2-size*Math.cos(angle-.55),y2-size*Math.sin(angle-.55),x2-size*Math.cos(angle+.55),y2-size*Math.sin(angle+.55));};
  if(action.startsWith('wind:')){
    const amount=Number(action.slice(5)),dir=Math.sign(amount),count=Math.abs(amount)===1?2:3;
    ctx.lineWidth=4;line(10,12,118,12);line(10,84,118,84);
    const width=count===2?42:29,gap=count===2?7:5;
    for(let i=0;i<count;i++){
      const x=64+(i-(count-1)/2)*(width+gap);
      ctx.save();ctx.translate(x,48);ctx.scale(dir,1);
      const back=-width/2,tip=width/2;
      ctx.beginPath();ctx.moveTo(back+3,-24);
      ctx.lineTo(tip-5,-3);ctx.quadraticCurveTo(tip,0,tip-5,3);
      ctx.lineTo(back+3,24);ctx.quadraticCurveTo(back,24,back,20);
      ctx.lineTo(back,-20);ctx.quadraticCurveTo(back,-24,back+3,-24);
      ctx.closePath();ctx.fill();ctx.restore();
    }
  }else switch(action){
    case 'play':poly(42,19,42,77,91,48);break;
    case 'reverse':poly(86,19,86,77,37,48);break;
    case 'pause':rect(43,22,13,52);rect(72,22,13,52);break;
    case 'stop':rect(40,24,48,48);break;
    case 'record':circle(64,48,24,true);break;
    case 'bell':line(40,68,88,68);ctx.beginPath();ctx.moveTo(43,63);ctx.bezierCurveTo(46,54,43,27,64,27);ctx.bezierCurveTo(85,27,82,54,85,63);ctx.stroke();circle(64,75,4,true);break;
    case 'loop':arc(64,48,27,.3,5.65);poly(88,26,99,39,82,40);break;
    case 'output':poly(27,38,43,38,63,23,63,73,43,58,27,58);arc(66,48,17,-.85,.85);arc(66,48,29,-.75,.75);break;
    case 'upload':arrow(64,68,64,22,12);line(34,66,34,77,94,77,94,66);break;
    case 'undo':arc(66,51,24,-2.65,1.75,true);poly(29,36,47,32,41,51);break;
    case 'redo':arc(62,51,24,1.4,5.8);poly(99,36,81,32,87,51);break;
    case 'console':ctx.strokeRect(31,25,66,46);line(41,39,54,48,41,57);line(62,57,82,57);break;
    case 'audition':arc(64,51,25,Math.PI,0);line(39,51,39,69,49,69,49,54);line(89,51,89,69,79,69,79,54);break;
    case 'split':line(34,29,34,67);line(94,29,94,67);line(47,75,81,21);break;
    case 'join':arrow(26,48,57,48,9);arrow(102,48,71,48,9);line(64,28,64,68);break;
    case 'reverse-clip':arrow(25,35,98,35,10);arrow(103,61,30,61,10);break;
    default:circle(64,48,20);break;
  }
  ctx.restore();
}
export function createPodIconCanvas(action,color='#ffffff'){
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;drawPodIcon(canvas.getContext('2d'),action,color);return canvas;
}
