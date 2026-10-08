const crypto = require('crypto');
const fs = require('fs');

const MASTER_EMAIL = 'jon@ojsolutions.io';
const PATHNAME = 'proofline/workspace.json';

function emptyWorkspace(){
  return { users: [], brands: [], designs: [], plans: [], notes: [] };
}

function storeFile(){
  return process.env.PROOFLINE_STORE || '/tmp/proofline-workspace.json';
}

function hashPassword(password, salt){
  const use = salt || crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(String(password), use, 32).toString('hex');
  return { passwordSalt: use, passwordHash };
}

function passwordOk(password, user){
  if (!user || !user.passwordSalt || !user.passwordHash) return false;
  const next = crypto.scryptSync(String(password), user.passwordSalt, 32);
  const prev = Buffer.from(user.passwordHash, 'hex');
  if (next.length !== prev.length) return false;
  return crypto.timingSafeEqual(next, prev);
}

function publicUser(user){
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    kind: user.kind === 'client' ? 'client' : 'agency',
    master: !!user.master,
    roles: user.roles || {}
  };
}

function sessionSecret(){
  return process.env.SESSION_SECRET || '741c518af55d4a647c299e3f0c8f7834fb3435edfbb04d324252b027e23b79eb';
}

function signSession(user){
  const body = Buffer.from(JSON.stringify({
    uid: user.id,
    exp: Date.now() + 14 * 24 * 60 * 60 * 1000
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return body + '.' + sig;
}

function readSession(token){
  if (!token || token.indexOf('.') < 0) return null;
  const body = token.slice(0, token.lastIndexOf('.'));
  const sig = token.slice(token.lastIndexOf('.') + 1);
  const expect = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.uid || !payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

function tokenFrom(req){
  const raw = String((req.headers && req.headers.cookie) || '');
  const match = raw.match(/(?:^|;\s*)pf_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function sessionCookie(token, maxAge){
  const secure = process.env.VERCEL ? '; Secure' : '';
  return 'pf_session=' + encodeURIComponent(token) + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=' + maxAge + secure;
}

function canSeeBrand(user, brandId){
  if (!user || user.master || user.kind !== 'client') return true;
  const role = (user.roles || {})[brandId];
  return !!role && role !== '—';
}

function isAdmin(user){
  return !!(user && user.kind !== 'client' && (user.master || Object.values(user.roles || {}).includes('Admin')));
}

function viewFor(user, ws){
  const users = (ws.users || []).map(publicUser);
  if (!user || user.master || user.kind !== 'client') {
    return { users, brands: ws.brands || [], designs: ws.designs || [], plans: ws.plans || [], notes: ws.notes || [] };
  }
  const brands = (ws.brands || []).filter(b => canSeeBrand(user, b.id));
  const ids = new Set(brands.map(b => b.id));
  const names = new Set(brands.map(b => b.name));
  return {
    users: users.filter(u => u.id === user.id || Object.entries(u.roles || {}).some(([id, role]) => ids.has(id) && role && role !== '—')),
    brands,
    designs: (ws.designs || []).filter(d => ids.has(d.brandId)),
    plans: (ws.plans || []).filter(p => ids.has(p.brandId)),
    notes: (ws.notes || []).filter(n => !n.brand || names.has(n.brand))
  };
}

async function readBlob(){
  const blob = require('@vercel/blob');
  try {
    const result = await blob.get(PATHNAME, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch (err) {
    const missing = err && (err.name === 'BlobNotFoundError' || err.status === 404 || /not found/i.test(String(err.message || '')));
    if (missing) return null;
    throw err;
  }
}

async function writeBlob(ws){
  const blob = require('@vercel/blob');
  await blob.put(PATHNAME, JSON.stringify(ws), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json'
  });
}

function readFile(){
  try {
    return JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function writeFile(ws){
  fs.writeFileSync(storeFile(), JSON.stringify(ws));
}

async function readRaw(){
  if (process.env.BLOB_READ_WRITE_TOKEN) return readBlob();
  return readFile();
}

async function writeRaw(ws){
  if (process.env.BLOB_READ_WRITE_TOKEN) return writeBlob(ws);
  return writeFile(ws);
}

function makeMaster(password){
  const hashed = password ? hashPassword(password) : {
    passwordSalt: '0012e9856e092fb1b5ba148de684e45a',
    passwordHash: '96570f2450adf89d24ff59eb878ffaa44f21005b1592eac1dca3a47ba236c20e'
  };
  return {
    id: 'u-master',
    name: 'Jon Falade',
    email: MASTER_EMAIL,
    kind: 'agency',
    master: true,
    roles: {},
    passwordSalt: hashed.passwordSalt,
    passwordHash: hashed.passwordHash
  };
}

let chain = Promise.resolve();

function update(mutator){
  const run = chain.then(async () => {
    let ws = await readRaw();
    if (!ws || !Array.isArray(ws.users)) ws = emptyWorkspace();
    const before = JSON.stringify(ws);
    if (!ws.users.some(u => String(u.email || '').toLowerCase() === MASTER_EMAIL)) {
      ws.users.unshift(makeMaster(process.env.MASTER_PASSWORD || ''));
    }
    const next = await mutator(ws);
    const save = next === undefined ? ws : next;
    if (JSON.stringify(save) !== before) await writeRaw(save);
    return save;
  });
  chain = run.then(() => {}, () => {});
  return run;
}

async function load(){
  return update(ws => ws);
}

async function actorFrom(req){
  const payload = readSession(tokenFrom(req));
  if (!payload) return null;
  const ws = await load();
  return { ws, user: ws.users.find(u => u.id === payload.uid) || null };
}

function readBody(req){
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch (err) { return {}; }
  }
  return req.body;
}

function mergeUsers(stored, incoming){
  const prev = new Map((stored || []).map(u => [u.id, u]));
  const next = (incoming || []).map(u => {
    const old = prev.get(u.id);
    if (!old) return null;
    return {
      id: old.id,
      name: String(u.name || old.name || '').slice(0, 80),
      email: old.master ? old.email : String(u.email || old.email || '').toLowerCase(),
      kind: old.master ? 'agency' : (u.kind === 'client' ? 'client' : 'agency'),
      master: !!old.master,
      roles: u.roles && typeof u.roles === 'object' ? u.roles : (old.roles || {}),
      passwordSalt: old.passwordSalt,
      passwordHash: old.passwordHash
    };
  }).filter(Boolean);
  (stored || []).forEach(u => {
    if (u.master && !next.some(n => n.id === u.id)) next.unshift(u);
    else if (!next.some(n => n.id === u.id)) next.push(u);
  });
  return next;
}

function applyIncoming(stored, incoming, actor){
  const brands = Array.isArray(incoming.brands) ? incoming.brands : stored.brands;
  const designs = Array.isArray(incoming.designs) ? incoming.designs : stored.designs;
  const plans = Array.isArray(incoming.plans) ? incoming.plans : stored.plans;
  const notes = Array.isArray(incoming.notes) ? incoming.notes : stored.notes;
  if (isAdmin(actor)) {
    return {
      users: mergeUsers(stored.users, incoming.users || stored.users.map(publicUser)),
      brands, designs, plans, notes
    };
  }
  if (actor.kind !== 'client') {
    return { users: stored.users, brands: stored.brands, designs, plans, notes };
  }
  const ids = new Set((stored.brands || []).filter(b => canSeeBrand(actor, b.id)).map(b => b.id));
  const names = new Set((stored.brands || []).filter(b => ids.has(b.id)).map(b => b.name));
  return {
    users: stored.users,
    brands: stored.brands,
    designs: (stored.designs || []).filter(d => !ids.has(d.brandId)).concat(designs.filter(d => ids.has(d.brandId))),
    plans: (stored.plans || []).filter(p => !ids.has(p.brandId)).concat(plans.filter(p => ids.has(p.brandId))),
    notes: (stored.notes || []).filter(n => n.brand && !names.has(n.brand)).concat(notes.filter(n => !n.brand || names.has(n.brand)))
  };
}

module.exports = {
  MASTER_EMAIL,
  hashPassword,
  passwordOk,
  publicUser,
  signSession,
  tokenFrom,
  sessionCookie,
  canSeeBrand,
  isAdmin,
  viewFor,
  update,
  load,
  actorFrom,
  readBody,
  applyIncoming
};
