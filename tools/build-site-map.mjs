import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('data/site-map.json', root), 'utf8'));
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const rooms = manifest.rooms;
const room = (id, x, y, width, height, color, subtitle, image = '') => {
  const item = rooms.find(value => value.id === id);
  return `<a class="map-room" href="#room-${esc(id)}" aria-label="${esc(item.label)}: browse ${item.entries.length} entries">
  <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="19" fill="${color}"/>
  ${image ? `<image href="assets/navbar-models/${image}.png" x="${x + width - 100}" y="${y + 16}" width="88" height="88" aria-hidden="true"/>` : ''}
  <text x="${x + 24}" y="${y + 44}" class="room-name">${esc(item.label)}</text>
  <text x="${x + 24}" y="${y + 74}" class="room-detail">${esc(subtitle)}</text>
  <text x="${x + 24}" y="${y + height - 22}" class="room-enter">Browse the room →</text></a>`;
};
const map = `<svg viewBox="0 0 1120 790" role="group" aria-labelledby="map-title map-description">
<title id="map-title">Matt Hall's creative building</title><desc id="map-description">A building directory. Six rooms surround a central hallway. Start is the entrance lobby, Selected work is a gallery, and the hiring desk is beside the entrance. Choose a room to browse its links below. The full directory follows the map.</desc>
<rect x="14" y="14" width="1092" height="762" rx="38" fill="#ded9ce"/>
<path d="M48 48H1072V742H48Z" fill="#f7f1e6" stroke="#4e4654" stroke-width="8"/>
<path d="M468 76H652V566H986V698H134V566H468Z" fill="#e4dfd4" stroke="#fffaf0" stroke-width="6"/>
<path d="M560 172V612M306 624H814" fill="none" stroke="#c5bcac" stroke-width="3" stroke-dasharray="6 10"/>
${room('about', 76, 76, 366, 142, '#f0c7c5', 'Cube · six interactive faces', 'about')}
${room('videos', 76, 238, 366, 142, '#bcddec', 'Video collections · animation', 'videos')}
${room('graphics', 76, 400, 366, 142, '#f3d3a7', 'Coursebooks · board games', 'graphics')}
${room('games', 678, 76, 366, 142, '#d7c3ea', 'Arcade · playable projects', 'games')}
${room('music', 678, 238, 366, 142, '#c9dfbd', 'Piano · compositions', 'music')}
${room('docs', 678, 400, 366, 142, '#d6d6cf', 'Teaching resources · presentations', 'docs')}
${room('start', 76, 568, 250, 174, '#d7e7cf', 'Welcome · comfort settings')}
${room('selected-work', 348, 568, 424, 174, '#e7d5b2', 'Just Speak · NeoTube Studios')}
${room('shared-utilities', 794, 568, 250, 174, '#decce2', 'Résumé · email · help')}
<g aria-hidden="true"><circle cx="560" cy="408" r="21" fill="#8b3656" stroke="#fff" stroke-width="5"/><path d="M549 425L560 445 571 425" fill="#8b3656"/><text x="560" y="474" text-anchor="middle" class="here-title">You are here</text><text x="560" y="498" text-anchor="middle" class="here-detail">Directory</text>
<text x="560" y="122" text-anchor="middle" class="hall-label">EXPLORE</text><text x="560" y="146" text-anchor="middle" class="hall-label">AT YOUR PACE</text></g></svg>`;
const sections = rooms.map(item => `<section class="directory-room" id="room-${esc(item.id)}" data-room="${esc(item.id)}" tabindex="-1" aria-labelledby="heading-${esc(item.id)}">
<header class="room-heading"><div><p class="eyebrow">${esc(item.description)}</p><h2 id="heading-${esc(item.id)}">${esc(item.label)}</h2></div>${item.path ? `<a class="enter-room" href="${esc(item.path)}">Enter ${esc(item.label)} →</a>` : ''}</header>
<ul class="entry-list">${item.entries.map(entry => `<li data-entry><a href="${esc(entry.path)}"${entry.id === 'resume' ? ' download="Matt Hall - Resume.pdf"' : ''}>${esc(entry.label)}</a><p>${esc(entry.action)}</p>${entry.inPage ? '<span class="entry-kind">Inside the section</span>' : ''}</li>`).join('')}</ul></section>`).join('');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Find your way around Matt Hall’s interactive portfolio: video, books, games, music, creative tools, résumé and contact."><title>Sitemap | Matt Hall</title><link rel="stylesheet" href="_7-shared-scripts/site-map.css"><script type="module" src="_7-shared-scripts/site-map.js"></script></head>
<body><a class="skip" href="#directory">Skip to the complete directory</a><header class="site-map-header"><a href="index.html" class="home">← Back to Start</a><a href="assets/documents/matt-hall-resume.pdf" download="Matt Hall - Resume.pdf">Résumé PDF</a><a href="mailto:MattHall.JMH@gmail.com">Email me</a></header>
<main><div class="map-introduction"><p class="eyebrow">Matt Hall · Portfolio directory</p><h1>Find your way.</h1><p>Step into a room to explore. Each section has an interactive model, with work and tools to discover inside.</p><a href="#directory">Browse the complete list ↓</a></div>
<section class="building-map" id="building-map" aria-label="Building directory">${map}</section>
<div class="directory-toolbar" id="directory"><h2>Room directory</h2><form role="search" hidden><label for="directory-search">Find a project, room or tool</label><input id="directory-search" name="q" type="search" placeholder="Try books, piano or Blender" autocomplete="off"><button type="reset">Clear</button></form><p id="directory-count" role="status" aria-live="polite">${rooms.reduce((sum, item) => sum + item.entries.length, 0)} entries across ${rooms.length} areas.</p></div>
<div class="directory-rooms">${sections}</div><p id="directory-empty" hidden>No matching entries. Try another word or clear the search.</p>
<footer><a href="#building-map">Back to the map ↑</a><p>Links labelled “Inside the section” open that room. The accompanying text tells you how to find the item there.</p><p><a href="data/site-map.json">Structured sitemap entries</a></p></footer></main></body></html>`;
await writeFile(new URL('sitemap.html', root), html);
console.log(`Sitemap written: ${rooms.length} rooms, ${rooms.reduce((sum, item) => sum + item.entries.length, 0)} entries.`);
