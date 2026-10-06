export function enhanceHeader(root = document) {
  const page = new URL(root.baseURI || location.href);
  const current = page.pathname.endsWith('/') ? '/index.html' : page.pathname;
  for (const link of root.querySelectorAll('.navigation a[href]')) {
    const target = new URL(link.getAttribute('href'), page);
    if (target.pathname === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}
