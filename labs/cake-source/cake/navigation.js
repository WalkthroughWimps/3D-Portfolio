const pages = [
  ['home', 'index.html', '✦', 'Bougie Cakes'],
  ['flavors', 'flavors.html', '⌁', 'Flavors'],
  ['gallery', 'gallery.html', '▧', 'Gallery'],
  ['about', 'about.html', 'i', 'About'],
  ['inquire', 'order.html', '↗', 'Build a cake']
];

const current = document.body.dataset.page || 'home';
const ordering=current==='order';
if (document.body.dataset.mode !== 'preview') {
const navigation = document.createElement('nav');
navigation.className = 'universal-nav';
navigation.setAttribute('aria-label', 'Site pages');
const brandNameNode = document.querySelector('.page-logo [data-site-content="businessName"], #site-name[data-site-content="businessName"]');
const brandName = brandNameNode?.textContent.trim() || 'Bougie Cakes';
for (const [id, href, icon, label] of pages) {
  const link = document.createElement('a');
  link.className = `page-button${id === current ? ' is-current' : ''}`;
  link.href = href;
  if(ordering&&id==='inquire')link.href='index.html';
  if (id === current) link.setAttribute('aria-current', 'page');
  if (id === 'home') link.setAttribute('aria-label', `${brandName} home`);
  const iconNode = document.createElement('span');
  iconNode.className = 'page-icon';
  iconNode.setAttribute('aria-hidden', 'true');
  iconNode.textContent = ordering&&id==='inquire'?'⌂':icon;
  const labelNode = document.createElement('span');
  labelNode.className = 'page-label';
  labelNode.textContent = ordering&&id==='inquire'?'Site':id === 'home' ? 'Home' : label;
  link.append(iconNode, labelNode);
  navigation.append(link);
}
navigation.style.gridTemplateColumns='repeat(5,minmax(0,1fr))';
if(ordering)navigation.classList.add('build-site-nav');
document.body.append(navigation);
}
