const dns = require('dns').promises;
const net = require('net');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const SOCIAL_HOSTS = {
  'instagram.com': 'instagram',
  'twitter.com': 'x',
  'x.com': 'x',
  'facebook.com': 'facebook',
  'fb.com': 'facebook',
  'm.facebook.com': 'facebook',
  'tiktok.com': 'tiktok',
  'linkedin.com': 'linkedin',
  'youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'm.youtube.com': 'youtube'
};

function fail(message, status){
  const err = new Error(message);
  err.status = status || 400;
  return err;
}

function isPrivateIp(ip){
  const kind = net.isIP(ip);
  if (kind === 4) {
    const p = ip.split('.').map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    if (p[0] >= 224) return true;
    return false;
  }
  if (kind === 6) {
    const n = ip.toLowerCase();
    if (n === '::1' || n === '::') return true;
    if (n.startsWith('fe80') || n.startsWith('fc') || n.startsWith('fd')) return true;
    const mapped = n.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true;
}

async function assertPublic(urlString){
  let url;
  try { url = new URL(urlString); } catch (err) { throw fail('Enter a website or social link.'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw fail('Enter a website or social link.');
  const host = url.hostname.replace(/\.+$/, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host === 'metadata.google.internal') {
    throw fail('That address cannot be used.');
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw fail('That address cannot be used.');
    return url;
  }
  if (!host.includes('.')) throw fail('Enter a full website or social link.');
  let records = [];
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch (err) {
    throw fail('That site could not be found.');
  }
  if (!records.length || records.some(r => isPrivateIp(r.address))) throw fail('That address cannot be used.');
  return url;
}

function decodeAttr(value){
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function attr(tag, name){
  const re = new RegExp('\\b' + name + '\\s*=\\s*("|\')([\\s\\S]*?)\\1', 'i');
  const quoted = tag.match(re);
  if (quoted) return decodeAttr(quoted[2]);
  const bare = tag.match(new RegExp('\\b' + name + '\\s*=\\s*([^\\s>]+)', 'i'));
  return bare ? decodeAttr(bare[1]) : '';
}

function resolveUrl(base, href){
  const raw = String(href || '').trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('javascript:')) return '';
  try {
    const url = new URL(raw, base);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.href;
  } catch (err) {
    return '';
  }
}

function pageTitle(html){
  const patterns = [
    /<meta\b[^>]*property=["']og:site_name["'][^>]*content=["']([\s\S]*?)["']/i,
    /<meta\b[^>]*content=["']([\s\S]*?)["'][^>]*property=["']og:site_name["']/i
  ];
  for (let i = 0; i < patterns.length; i++) {
    const match = html.match(patterns[i]);
    if (match && match[1]) {
      const title = decodeAttr(match[1]).replace(/\s+/g, ' ').trim().slice(0, 80);
      if (title) return title;
    }
  }
  const title = html.match(/<title[^>]*>([^<]{1,160})<\/title>/i);
  if (!title) return '';
  return decodeAttr(title[1]).replace(/\s+/g, ' ').trim().split(/\s+[|–—-]\s+/)[0].slice(0, 80);
}

function socialInfo(url){
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const kind = SOCIAL_HOSTS[host];
  if (!kind) return null;
  const parts = url.pathname.split('/').filter(Boolean).map(part => {
    try { return decodeURIComponent(part); } catch (err) { return part; }
  });
  let handle = '';
  if (kind === 'linkedin') {
    const at = parts.findIndex(part => part === 'company' || part === 'in' || part === 'school');
    handle = at >= 0 ? (parts[at + 1] || '') : (parts[0] || '');
  } else if (kind === 'youtube') {
    handle = (parts.find(part => part.charAt(0) === '@') || parts[0] || '');
  } else if (kind === 'tiktok') {
    handle = parts[0] || '';
  } else {
    const skip = new Set(['p', 'reel', 'reels', 'stories', 'explore', 'home', 'search', 'intent', 'share', 'watch', 'channel', 'c', 'user', 'shorts']);
    handle = parts.find(part => !skip.has(part.toLowerCase())) || '';
  }
  handle = handle.replace(/^@/, '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80);
  return { kind, handle, host };
}

function parseOne(raw){
  let text = String(raw || '').trim();
  if (!text) return null;
  if (text.charAt(0) === '@') throw fail('Add the site or network, such as instagram.com/name.');
  if (!/^https?:\/\//i.test(text)) text = 'https://' + text.replace(/^\/+/, '');
  let url;
  try { url = new URL(text); } catch (err) { throw fail('Enter a website or social link.'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw fail('Enter a website or social link.');
  if (!url.hostname.includes('.')) throw fail('Enter a full website or social link.');
  url.hash = '';
  const social = socialInfo(url);
  const host = url.hostname.replace(/^www\./, '');
  const label = social && social.handle
    ? host + '/' + ((social.kind === 'tiktok' || social.kind === 'youtube') ? '@' : '') + social.handle
    : host;
  return {
    url: url.href,
    origin: url.origin,
    kind: social ? social.kind : '',
    handle: social ? social.handle : '',
    label,
    displayHandle: social && social.handle ? '@' + social.handle : ''
  };
}

function parseTargets(input){
  const chunks = String(input || '').split(/[\n,;]+/).map(part => part.trim()).filter(Boolean).slice(0, 4);
  if (!chunks.length) throw fail('Enter a website or social profile.');
  const targets = [];
  let firstError = null;
  chunks.forEach(chunk => {
    try { targets.push(parseOne(chunk)); }
    catch (err) { if (!firstError) firstError = err; }
  });
  if (!targets.length) throw firstError;
  return targets;
}

function iconScore(rel, sizes){
  const value = String(rel || '').toLowerCase();
  if (value.includes('mask-icon')) return 30;
  if (value.includes('apple-touch-icon')) return 220;
  if (!/(^|\s)icon(\s|$)/.test(value) && !value.includes('shortcut')) return 0;
  const size = parseInt(sizes, 10);
  if (!size || String(sizes).toLowerCase() === 'any') return 90;
  if (size >= 128) return 140 + Math.min(size, 512) / 10;
  if (size >= 32) return 70 + size;
  return 25;
}

function collectFromHtml(html, base, social){
  const found = [];
  const linkRe = /<link\b[^>]*>/gi;
  const metaRe = /<meta\b[^>]*>/gi;
  let match;
  while ((match = linkRe.exec(html))) {
    const tag = match[0];
    const rel = attr(tag, 'rel');
    const href = resolveUrl(base, attr(tag, 'href'));
    if (!href) continue;
    if (String(rel).toLowerCase().includes('manifest')) {
      found.push({ url: href, score: 1, name: 'manifest', manifest: true });
      continue;
    }
    const score = iconScore(rel, attr(tag, 'sizes'));
    if (score) found.push({ url: href, score, name: href.split('/').pop().split('?')[0] || 'icon' });
  }
  while ((match = metaRe.exec(html))) {
    const tag = match[0];
    const prop = (attr(tag, 'property') || attr(tag, 'name')).toLowerCase();
    const content = resolveUrl(base, attr(tag, 'content'));
    if (!content) continue;
    if (prop === 'og:image' || prop === 'og:image:url' || prop === 'twitter:image') {
      found.push({ url: content, score: social ? 200 : 55, name: 'profile' });
    }
  }
  if (social) {
    const pic = html.match(/"profile_pic_url"\s*:\s*"([^"]+)"/);
    if (pic) {
      const url = resolveUrl(base, pic[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/'));
      if (url) found.push({ url, score: 230, name: 'profile' });
    }
  }
  return found;
}

async function fetchChecked(urlString, accept, maxBytes){
  let current = urlString;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(current);
    const response = await fetch(current, {
      redirect: 'manual',
      headers: { 'User-Agent': UA, 'Accept': accept },
      signal: AbortSignal.timeout(7000)
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw fail('That page did not return a logo.', 404);
      current = new URL(location, current).href;
      continue;
    }
    if (!response.ok) throw fail('That page did not return a logo.', 404);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw fail('That image is too large to use.', 404);
    return {
      buffer,
      contentType: response.headers.get('content-type') || '',
      finalUrl: current
    };
  }
  throw fail('That page did not return a logo.', 404);
}

function sniff(buf, headerType){
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  const gif = buf.slice(0, 6).toString('ascii');
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  if (buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.length >= 4 && buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return 'image/x-icon';
  const head = buf.slice(0, 240).toString('utf8').trim().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  const header = String(headerType || '').split(';')[0].trim().toLowerCase();
  if (header === 'image/jpg' || header === 'image/jpeg') return 'image/jpeg';
  if (header === 'image/png' || header === 'image/gif' || header === 'image/webp' || header === 'image/svg+xml' || header === 'image/x-icon' || header === 'image/vnd.microsoft.icon') {
    return header === 'image/vnd.microsoft.icon' ? 'image/x-icon' : header;
  }
  return '';
}

function imageSize(buf){
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf.length >= 24) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf.length >= 10) return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf.length >= 8) return { w: buf[6] || 256, h: buf[7] || 256 };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 8) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      const len = buf.readUInt16BE(i + 2);
      if (!len) break;
      i += 2 + len;
    }
  }
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP' && buf.slice(12, 16).toString('ascii') === 'VP8X' && buf.length >= 30) {
    return {
      w: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
      h: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16))
    };
  }
  return null;
}

function squareEnough(buf, mime){
  if (mime === 'image/svg+xml') return true;
  const size = imageSize(buf);
  if (!size || !size.w || !size.h) return true;
  const ratio = size.w / size.h;
  return ratio <= 1.85 && ratio >= 0.55 && size.w >= 16 && size.h >= 16;
}

function asDataUrl(buf, mime){
  if (mime === 'image/svg+xml') {
    const text = buf.toString('utf8');
    if (/<script|foreignObject|onload=|javascript:/i.test(text)) return '';
  }
  return 'data:' + mime + ';base64,' + buf.toString('base64');
}

async function socialCandidates(target){
  const list = [];
  if (!target.kind || !target.handle) return list;
  if (target.kind === 'x') {
    try {
      const got = await fetchChecked('https://api.fxtwitter.com/' + encodeURIComponent(target.handle), 'application/json', 400000);
      const json = JSON.parse(got.buffer.toString('utf8'));
      const avatar = json && json.user && (json.user.avatar_url || json.user.avatar);
      if (avatar) list.push({ url: String(avatar).replace('_normal.', '_400x400.'), score: 240, name: 'profile' });
    } catch (err) {}
  }
  if (target.kind === 'facebook') {
    list.push({ url: 'https://graph.facebook.com/' + encodeURIComponent(target.handle) + '/picture?type=large', score: 210, name: 'profile' });
  }
  const provider = { instagram: 'instagram', x: 'twitter', facebook: 'facebook', tiktok: 'tiktok', youtube: 'youtube' }[target.kind];
  if (provider) list.push({ url: 'https://unavatar.io/' + provider + '/' + encodeURIComponent(target.handle) + '?fallback=false', score: target.kind === 'instagram' ? 180 : 40, name: 'profile' });
  return list;
}

async function manifestIcons(url){
  try {
    const got = await fetchChecked(url, 'application/manifest+json,application/json', 300000);
    const json = JSON.parse(got.buffer.toString('utf8'));
    return (json.icons || []).map(icon => {
      const href = resolveUrl(got.finalUrl, icon.src);
      if (!href) return null;
      const size = parseInt(icon.sizes, 10) || 64;
      return { url: href, score: 150 + Math.min(size, 512) / 10, name: 'icon' };
    }).filter(Boolean);
  } catch (err) {
    return [];
  }
}

async function downloadImage(candidate){
  const got = await fetchChecked(candidate.url, 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8', 500000);
  const mime = sniff(got.buffer, got.contentType);
  if (!mime) return null;
  const dataUrl = asDataUrl(got.buffer, mime);
  if (!dataUrl || dataUrl.length > 700000) return null;
  return { logoUrl: dataUrl, logoName: candidate.name || 'logo', square: squareEnough(got.buffer, mime) };
}

async function logoForTarget(target){
  await assertPublic(target.url);
  let title = '';
  const candidates = await socialCandidates(target);
  candidates.push(
    { url: target.origin + '/apple-touch-icon.png', score: 160, name: 'apple-touch-icon.png' },
    { url: target.origin + '/favicon.ico', score: 20, name: 'favicon.ico' }
  );
  try {
    const page = await fetchChecked(target.url, 'text/html,application/xhtml+xml', 800000);
    const html = page.buffer.toString('utf8');
    title = pageTitle(html);
    const fromHtml = collectFromHtml(html, page.finalUrl, !!target.kind);
    const manifest = fromHtml.find(item => item.manifest);
    candidates.push(...fromHtml.filter(item => !item.manifest));
    if (manifest && !fromHtml.some(item => item.score >= 200)) {
      candidates.push(...await manifestIcons(manifest.url));
    }
  } catch (err) {
    if (err.status === 400) throw err;
  }
  if (!target.kind) {
    try {
      const host = new URL(target.url).hostname;
      candidates.push({ url: 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=128', score: 15, name: 'favicon.png' });
    } catch (err) {}
  }
  const ordered = candidates
    .filter(item => item.url)
    .sort((a, b) => b.score - a.score)
    .filter((item, index, all) => all.findIndex(other => other.url === item.url) === index)
    .slice(0, 6);
  let loose = null;
  for (let i = 0; i < ordered.length; i++) {
    try {
      const image = await downloadImage(ordered[i]);
      if (!image) continue;
      image.title = title;
      if (image.square) return image;
      if (!loose) loose = image;
    } catch (err) {
      if (err.status === 400) throw err;
    }
  }
  return loose;
}

async function fetchLogo(input){
  const targets = parseTargets(input);
  let lastError = null;
  for (let i = 0; i < targets.length; i++) {
    try {
      const image = await logoForTarget(targets[i]);
      if (image && image.logoUrl) {
        return {
          logoUrl: image.logoUrl,
          logoName: image.logoName,
          title: image.title || '',
          profileUrl: targets[i].url,
          profileLabel: targets.map(item => item.label).join(' · '),
          handle: targets[i].displayHandle || ''
        };
      }
    } catch (err) {
      lastError = err;
      if (err.status === 400) throw err;
    }
  }
  if (lastError && lastError.status === 400) throw lastError;
  const missed = fail('No logo was found there. You can upload an icon after the brand is added.', 404);
  missed.profileUrl = targets[0].url;
  missed.profileLabel = targets.map(item => item.label).join(' · ');
  missed.handle = targets[0].displayHandle || '';
  throw missed;
}

module.exports = { fetchLogo, parseTargets, isPrivateIp };
