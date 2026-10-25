(() => {
  if(document.body.dataset.mode==='preview'||document.querySelector('[data-cake-navigation]'))return;
  const current=document.body.dataset.page||'home',ordering=current==='order';
  const navigation=document.createElement('nav');
  navigation.className='universal-nav'+(ordering?' build-site-nav':'');
  navigation.dataset.cakeNavigation='true';navigation.setAttribute('aria-label',ordering?'Cake request sections':'Site pages');
  navigation.style.gridTemplateColumns='repeat(5,minmax(0,1fr))';
  const iconLabel=(control,icon,label)=>{
    const symbol=document.createElement('span');symbol.className='page-icon';symbol.setAttribute('aria-hidden','true');symbol.textContent=icon;
    const text=document.createElement('span');text.className='page-label';text.textContent=label;
    control.className='page-button';control.append(symbol,text);
  };
  if(ordering){
    for(const [section,icon,label]of [['allergens','⚑','Allergens'],['time','◷','Date'],['cake','▰','Cake'],['review','≡','Review']]){
      const button=document.createElement('button');button.type='button';button.dataset.orderSection=section;
      iconLabel(button,icon,label);button.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('cake-order-section',{detail:{section}})));
      navigation.append(button);
    }
    const site=document.createElement('a');site.href='index.html';site.setAttribute('aria-label','Return to the cake site');iconLabel(site,'⌂','Site');navigation.append(site);
    const update=section=>{for(const button of navigation.querySelectorAll('[data-order-section]')){
      const active=button.dataset.orderSection===section;button.classList.toggle('is-current',active);
      if(active)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
    }};
    document.addEventListener('cake-order-section-change',event=>update(event.detail?.section||document.body.dataset.orderSection||'allergens'));
    update(document.body.dataset.orderSection||'allergens');
    navigation.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const controls=[...navigation.querySelectorAll('button,a')],at=controls.indexOf(document.activeElement);if(at<0)return;
      event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?controls.length-1:(at+(event.key==='ArrowRight'?1:-1)+controls.length)%controls.length;controls[next].focus();
    });
  }else{
    for(const [id,href,icon,label]of [['home','index.html','✦','Home'],['flavors','flavors.html','⌁','Flavors'],['gallery','gallery.html','▧','Gallery'],['about','about.html','i','About'],['inquire','order.html','↗','Build a cake']]){
      const link=document.createElement('a');link.href=href;iconLabel(link,icon,label);
      if(id===current){link.classList.add('is-current');link.setAttribute('aria-current','page');}navigation.append(link);
    }
  }
  document.body.append(navigation);
})();
