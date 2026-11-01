const inside = (p,r) => !!p && p.x>=r.x && p.x<=r.x+r.w && p.y>=r.y && p.y<=r.y+r.h;
const inCircle = (p,c) => !!p && Math.hypot(p.x-c.x,p.y-c.y)<c.r;

export function instructionZoomLayout(ui) {
  const g=ui.gameRect, w=g.w, h=g.h, icon=w*.028, close=w*.024;
  const topText={x:g.x+w*(107.56/1920),y:g.y,w:w*(295/1920),h:h*.05};
  const bottomText={x:g.x+w*(1375/1920),y:g.y+h*(994/1080),w:w*(295/1920),h:h*(86/1080)};
  const topBox={x:g.x+w*.008,y:ui.top.y+ui.top.h*.14,w:w*.34,h:ui.top.h*.86+h*.05};
  const bottomBox={x:g.x+w*.66,y:g.y+h-h*.16,w:w*.27,h:h*.16+ui.bottom.h*.62};
  const gear={x:g.x+w*(69/1920),y:g.y+h*(69/1080),r:w*(61/1920)};
  const board={x:g.x+w*.09,y:g.y+h*.055,w:w*.615,h:h*.925};
  return {
    gear,board, back:{x:ui.backRect.x-6,y:ui.backRect.y-6,w:ui.backRect.w+12,h:ui.backRect.h+12},
    top:{text:topText,box:topBox,icon:{x:topText.x+topText.w+w*.008,y:g.y+h*.012,w:icon,h:icon},
      openIcon:{x:topBox.x+topBox.w-icon-10,y:topBox.y+topBox.h-icon-8,w:icon,h:icon},
      close:{x:topBox.x+topBox.w-close-8,y:topBox.y+8,w:close,h:close}},
    bottom:{text:bottomText,box:bottomBox,icon:{x:bottomText.x-icon-w*.01,y:g.y+h*.945-icon/2,w:icon,h:icon},
      openIcon:{x:bottomBox.x+10,y:g.y+h+ui.bottom.h*.26,w:icon,h:icon},
      close:{x:bottomBox.x+bottomBox.w-close-8,y:bottomBox.y+8,w:close,h:close}}
  };
}

export function createGameInstructionZoom() {
  let layout=null;
  const states={top:{pinned:false,hover:false,dismissed:false},bottom:{pinned:false,hover:false,dismissed:false}};
  const open=id=>states[id].pinned || states[id].hover;
  const inBox=(id,p)=>inside(p,layout[id].box) && (id==='top' ? (!inCircle(p,layout.gear) && !inside(p,layout.back)) : !inside(p,layout.board));
  function hit(p) {
    if (!layout) return null;
    for (const id of ['top','bottom']) {
      const item=layout[id];
      if (open(id) && inside(p,item.close)) return {id,part:'close'};
      // The icon moves into the border when its hover preview opens. Retain
      // its original press target too, so that same click can pin the preview.
      if (inside(p,item.icon) || (open(id)&&inside(p,item.openIcon))) return {id,part:'icon'};
      if (open(id) && inBox(id,p)) return {id,part:'box'};
      if (inside(p,item.text) && (id!=='top' || !inCircle(p,layout.gear))) return {id,part:'text'};
    }
    return null;
  }
  function move(p) {
    if (!layout) return false;
    for (const id of ['top','bottom']) {
      const item=layout[id], s=states[id];
      const over=(inside(p,item.text)&&(id!=='top'||!inCircle(p,layout.gear)))||inside(p,item.icon)||(open(id)&&(inBox(id,p)||inside(p,item.openIcon)));
      if (!over) s.dismissed=false;
      s.hover=over&&!s.dismissed;
    }
    return !!hit(p);
  }
  function press(p,button=0) {
    const target=hit(p);
    if (!target) return false;
    if (button!==0) return true;
    const s=states[target.id];
    if (target.part==='close') {s.pinned=false;s.hover=false;s.dismissed=true;}
    else if (target.part==='icon' || target.part==='text') s.pinned=!s.pinned;
    return true;
  }
  function reset() {layout=null;for(const s of Object.values(states)){s.pinned=false;s.hover=false;s.dismissed=false;}}
  function close() {const had=Object.keys(states).some(open);for(const s of Object.values(states)){s.pinned=false;s.hover=false;s.dismissed=true;}return had;}
  function magnifier(ctx,r,fg,bg) {
    ctx.save();ctx.fillStyle=bg;ctx.strokeStyle=fg;ctx.lineWidth=Math.max(2,r.w*.055);
    ctx.beginPath();ctx.arc(r.x+r.w/2,r.y+r.h/2,r.w*.46,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.arc(r.x+r.w*.43,r.y+r.h*.42,r.w*.19,0,Math.PI*2);
    ctx.moveTo(r.x+r.w*.58,r.y+r.h*.57);ctx.lineTo(r.x+r.w*.74,r.y+r.h*.74);ctx.stroke();ctx.restore();
  }
  function panel(ctx,id,theme,w) {
    const item=layout[id],r=item.box,pad=w*.009,font=w*.016;
    ctx.save();ctx.beginPath();ctx.roundRect(r.x,r.y,r.w,r.h,12);ctx.clip();
    if(id==='top') {
      // The panel can extend into the border, but the gear and back arrow keep
      // their original pixels and input targets, including the gear's curve.
      ctx.beginPath();ctx.rect(r.x,r.y,r.w,r.h);
      ctx.moveTo(layout.gear.x+layout.gear.r,layout.gear.y);
      ctx.arc(layout.gear.x,layout.gear.y,layout.gear.r,0,Math.PI*2);
      ctx.rect(layout.back.x,layout.back.y,layout.back.w,layout.back.h);ctx.clip('evenodd');
    } else {
      ctx.beginPath();ctx.rect(r.x,r.y,r.w,r.h);
      ctx.rect(layout.board.x,layout.board.y,layout.board.w,layout.board.h);ctx.clip('evenodd');
    }
    ctx.fillStyle=theme.bg;ctx.globalAlpha=.98;ctx.fillRect(r.x,r.y,r.w,r.h);ctx.globalAlpha=1;
    ctx.strokeStyle=theme.fg;ctx.lineWidth=2;ctx.strokeRect(r.x+1,r.y+1,r.w-2,r.h-2);
    ctx.fillStyle=theme.fg;ctx.font=`${font}px Arial, sans-serif`;ctx.textAlign='left';ctx.textBaseline='top';
    const paragraphs=id==='top'?['Left-click gear for bonus options.','Right-click gear to reset the grid.']:
      ['Right-click to set active team.','Middle-click, then use the wheel','to change score or character.'];
    let y=r.y+pad;
    for(const paragraph of paragraphs) {
      const words=paragraph.split(' ');
      while(words.length) {
        let left=r.x+pad,right=r.x+r.w-pad;
        if(y<item.close.y+item.close.h)right=Math.min(right,item.close.x-pad);
        if(id==='top') {
          const c=layout.gear,dy=Math.max(0,Math.abs(y+font/2-c.y)-font/2);
          if(dy<c.r)left=Math.max(left,c.x+Math.sqrt(c.r*c.r-dy*dy)+pad);
          if(y<layout.back.y+layout.back.h&&y+font>layout.back.y)left=Math.max(left,layout.back.x+layout.back.w+pad);
          if(y+font>item.openIcon.y)right=Math.min(right,item.openIcon.x-pad);
        } else if(y<layout.board.y+layout.board.h&&y+font>layout.board.y) {
          left=Math.max(left,layout.board.x+layout.board.w+pad);
        }
        let line=words.shift();
        while(words.length&&ctx.measureText(line+' '+words[0]).width<=right-left)line+=' '+words.shift();
        ctx.fillText(line,left,y);y+=font*1.25;
      }
    }
    ctx.restore();
    const c=item.close;
    ctx.save();ctx.strokeStyle=theme.fg;ctx.lineWidth=3;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(c.x+c.w*.3,c.y+c.h*.3);ctx.lineTo(c.x+c.w*.7,c.y+c.h*.7);
    ctx.moveTo(c.x+c.w*.7,c.y+c.h*.3);ctx.lineTo(c.x+c.w*.3,c.y+c.h*.7);ctx.stroke();ctx.restore();
  }
  return {
    draw(ctx,ui,theme) {layout=instructionZoomLayout(ui);for(const id of ['top','bottom']){if(open(id))panel(ctx,id,theme,ui.gameRect.w);magnifier(ctx,open(id)?layout[id].openIcon:layout[id].icon,theme.fg,theme.bg);}},
    move,press,hit,reset,close,
    getLayout:()=>layout,
    isOpen:id=>open(id)
  };
}
