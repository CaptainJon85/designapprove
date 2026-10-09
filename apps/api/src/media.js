const storage = require('@proofline/storage');

function parseDataUrl(value){
  const match = String(value).match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  const mime = match[1] || 'application/octet-stream';
  if (!mime.startsWith('image/')) return null;
  const body = match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]), 'utf8');
  if (!body.length || body.length > 2 * 1024 * 1024) return null;
  return { mime, body };
}

async function walk(value){
  if (typeof value === 'string') {
    if (!value.startsWith('data:image/')) return value;
    const parsed = parseDataUrl(value);
    if (!parsed) return value;
    const key = await storage.put(parsed.body, parsed.mime);
    return '/api/files/' + key;
  }
  if (Array.isArray(value)) {
    const next = [];
    for (const item of value) next.push(await walk(item));
    return next;
  }
  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, item] of Object.entries(value)) next[key] = await walk(item);
    return next;
  }
  return value;
}

async function externalizeWorkspace(ws){
  return {
    users: ws.users || [],
    brands: await walk(ws.brands || []),
    designs: await walk(ws.designs || []),
    plans: await walk(ws.plans || []),
    notes: await walk(ws.notes || [])
  };
}

module.exports = { externalizeWorkspace };
