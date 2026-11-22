import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('.', import.meta.url))
const output = process.argv[2]
if (!output) throw new Error('Pass the TOP FRUIT output directory.')

const base = '/top-fruit'
const products = JSON.parse(await readFile(join(source, 'products.json'), 'utf8'))
const [featured] = products
const inquiryUrl = `${base}/wholesale/#inquiry`
const contactUrl = `${base}/about/#contact`

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escape = value => String(value).replace(/[&<>"']/g, character => entities[character])
const productUrl = product => `${base}/products/${encodeURIComponent(product.slug)}/`
const button = (href, label, variant = 'primary') =>
  `<a class="button ${variant}" href="${escape(href)}">${escape(label)}</a>`
const inquiryButton = () => button(inquiryUrl, 'Request Wholesale Pricing')
const amazonNote = '<span class="pending">Amazon purchases are unavailable in this demo.</span>'

const links = [
  ['Products', `${base}/products/`],
  ['Wholesale', `${base}/wholesale/`],
  ['About', `${base}/about/`],
  ['Contact', contactUrl],
]

function layout(title, description, path, content) {
  const pageTitle = path === `${base}/` ? 'TOP FRUIT Wholesale Candy' : `${title} | TOP FRUIT`
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${escape(pageTitle)}</title>
  <meta name="description" content="${escape(description)}">
  <link rel="stylesheet" href="${base}/assets/site.css">
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <div class="demo-banner"><div class="wrap"><a href="/">Matt Hall Labs</a> · TOP FRUIT demo</div></div>
  <header class="site-header">
    <div class="wrap header-inner">
      <a class="wordmark" href="${base}/" aria-label="TOP FRUIT home">TOP<span>FRUIT</span></a>
      <nav aria-label="Main navigation">
        ${links.map(([label, href]) => `<a href="${href}"${path === href ? ' aria-current="page"' : ''}>${label}</a>`).join('\n        ')}
      </nav>
      ${inquiryButton()}
    </div>
  </header>
  <main id="main" tabindex="-1">
    ${content}
  </main>
  <footer class="site-footer">
    <div class="wrap footer-inner">
      <a class="wordmark" href="${base}/" aria-label="TOP FRUIT home">TOP<span>FRUIT</span></a>
      <nav aria-label="Footer navigation">
        <a href="${base}/products/">Products</a>
        <a href="${base}/wholesale/">Wholesale</a>
        <a href="${contactUrl}">Contact</a>
        <a href="${base}/privacy/">Privacy</a>
      </nav>
    </div>
  </footer>
</body>
</html>
`
}

function photoPlaceholder(label) {
  return `<div class="photo-placeholder"><span>${escape(label)}</span></div>`
}

function intro(title, description) {
  return `<section class="page-intro"><div class="wrap">
    <h1>${title}</h1><p class="lede">${description}</p>
  </div></section>`
}

function wholesaleProcess() {
  return `<ol class="process">
    <li><h3>Submit an inquiry</h3><p>Tell us about your business and the products you’re interested in.</p></li>
    <li><h3>Receive a quote</h3><p>Our team shares availability, case pricing and ordering details.</p></li>
    <li><h3>Confirm your order</h3><p>Finalize the order directly with the TOP FRUIT team.</p></li>
  </ol>`
}

function productCard(product) {
  return `<article class="product-card">
    ${photoPlaceholder('Packaging photo pending')}
    <div class="card-copy">
      <h2><a href="${productUrl(product)}">${escape(product.name)}</a></h2>
      <p>${escape(product.size)}</p>
      ${button(productUrl(product), 'View product', 'secondary')}
    </div>
  </article>`
}

const pages = [
  {
    file: 'index.html',
    path: `${base}/`,
    title: 'Home',
    description: 'Explore TOP FRUIT Mango Gummies for your store and learn how wholesale ordering works.',
    content: `<section class="hero">
      <div class="wrap hero-inner">
        <div class="hero-copy">
          <p class="eyebrow">TOP FRUIT Wholesale</p>
          <h1>Wholesale candy from TOP FRUIT</h1>
          <p class="lede">Explore TOP FRUIT mango gummies for your store. Contact our wholesale team for current product availability, case pricing and ordering details.</p>
          <div class="actions">${inquiryButton()}</div>
          <div class="consumer"><span>Shopping for yourself?</span> ${amazonNote}</div>
        </div>
        <div class="hero-product">
          ${photoPlaceholder('Packaging photo pending')}
          <a href="${productUrl(featured)}">${escape(featured.name)}</a>
          <span>${escape(featured.size)}</span>
        </div>
      </div>
    </section>
    <section class="wrap section featured">
      <div><p class="eyebrow">Featured product</p><h2>${escape(featured.name)}</h2><p>${escape(featured.size)}</p></div>
      ${button(productUrl(featured), 'View product', 'secondary')}
    </section>
    <section class="band"><div class="wrap section">
      <h2>How wholesale ordering works</h2>
      ${wholesaleProcess()}
    </div></section>
    <section class="wrap section closing-grid">
      <div><h2>About TOP FRUIT</h2><p>TOP FRUIT offers mango gummies to retailers, distributors and other business buyers.</p><a href="${base}/about/">About TOP FRUIT</a></div>
      <div><h2>Have a wholesale question?</h2><p>Find out what happens after you reach out.</p><a href="${base}/wholesale/#faq">Wholesale FAQs</a></div>
    </section>`,
  },
  {
    file: 'products/index.html',
    path: `${base}/products/`,
    title: 'Products',
    description: 'Browse the TOP FRUIT wholesale candy catalog.',
    content: `${intro('Products', 'Browse TOP FRUIT candy for your store.')}
      <section class="wrap section catalog" aria-label="Product catalog">
        ${products.map(productCard).join('\n')}
      </section>`,
  },
  ...products.map(product => ({
    file: `products/${product.slug}/index.html`,
    path: productUrl(product),
    title: product.name,
    description: `TOP FRUIT ${product.name}, ${product.size}, for wholesale buyers.`,
    content: `<section class="wrap section">
      <p class="breadcrumb"><a href="${base}/products/">All products</a></p>
      <div class="product-detail">
        ${photoPlaceholder('Packaging and candy photos pending')}
        <div class="product-copy">
          <p class="eyebrow">TOP FRUIT</p>
          <h1>${escape(product.name)}</h1>
          <p class="lede">${escape(product.size)}</p>
          <div class="actions">${inquiryButton()} ${amazonNote}</div>
        </div>
      </div>
    </section>
    <section class="band"><div class="wrap section">
      <h2>Label information</h2>
      <p>Ingredients, nutrition and allergen details are pending verification against the current package label.</p>
    </div></section>`,
  })),
  {
    file: 'wholesale/index.html',
    path: `${base}/wholesale/`,
    title: 'Wholesale',
    description: 'Learn how to request TOP FRUIT wholesale pricing and ordering details.',
    content: `${intro('Wholesale ordering with TOP FRUIT', 'Tell us about your business and the products you’re interested in. Our team will share current product information, case pricing and ordering details.')}
    <section class="wrap section">
      <h2>How to order</h2>${wholesaleProcess()}
    </section>
    <section class="band" id="inquiry"><div class="wrap section inquiry">
      <div>
        <h2>Request Wholesale Pricing</h2>
        <p id="inquiry-status">This example is read-only. The demo cannot send wholesale inquiries.</p>
      </div>
      <div class="inquiry-form">
        <fieldset disabled aria-describedby="inquiry-status">
          <legend>Business details</legend>
          <label for="buyer-name">Name</label><input id="buyer-name" name="name" autocomplete="name" required>
          <label for="business-name">Business name</label><input id="business-name" name="business" autocomplete="organization" required>
          <label for="business-email">Business email</label><input id="business-email" name="email" type="email" autocomplete="email" required>
          <label for="buyer-message">Product interest and estimated quantity</label><textarea id="buyer-message" name="message" rows="4" required></textarea>
          <button class="button primary" type="button">Send inquiry</button>
        </fieldset>
      </div>
    </div></section>
    <section class="wrap section faq" id="faq">
      <h2>Wholesale FAQs</h2>
      <details><summary>Who is wholesale for?</summary><p>Retailers, distributors and other business buyers can inquire about TOP FRUIT candy.</p></details>
      <details><summary>How do I get case pricing?</summary><p>Send an inquiry with your business and product details. The wholesale team will share current pricing and availability.</p></details>
      <details><summary>How do I place an order?</summary><p>Confirm your order directly with the wholesale team after you receive a quote.</p></details>
    </section>`,
  },
  {
    file: 'about/index.html',
    path: `${base}/about/`,
    title: 'About and Contact',
    description: 'Learn about TOP FRUIT and find the wholesale contact section.',
    content: `${intro('About TOP FRUIT', 'TOP FRUIT offers mango gummies to retailers, distributors and other business buyers.')}
    <section class="wrap section" id="contact">
      <h2>Contact</h2>
      <p>View the example wholesale inquiry form.</p>
      ${inquiryButton()}
    </section>`,
  },
  {
    file: 'privacy/index.html',
    path: `${base}/privacy/`,
    title: 'Privacy',
    description: 'Privacy notice status for the TOP FRUIT site preview.',
    content: intro('Privacy', 'The TOP FRUIT demo has no analytics or inquiry submission.'),
  },
  {
    file: '404.html',
    path: `${base}/404.html`,
    title: 'Page not found',
    description: 'Find your way back to TOP FRUIT.',
    content: `<section class="page-intro"><div class="wrap">
      <h1>Page not found</h1><p class="lede">Find your way back to TOP FRUIT.</p>
      <div class="actions">${button(`${base}/`, 'Back to home')} ${button(`${base}/products/`, 'Browse products', 'secondary')}</div>
    </div></section>`,
  },
]

for (const page of pages) {
  const destination = join(output, page.file)
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, layout(page.title, page.description, page.path, page.content), 'utf8')
}

await mkdir(join(output, 'assets'), { recursive: true })
await copyFile(join(source, 'site.css'), join(output, 'assets', 'site.css'))
console.log(`Built ${pages.length} TOP FRUIT demo pages to ${output}.`)
