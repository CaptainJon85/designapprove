require('../../scripts/load-env');
const { Pool } = require('pg');

let pool;

function getPool(){
  if (!process.env.DATABASE_URL) {
    const err = new Error('DATABASE_URL is not set.');
    err.status = 503;
    throw err;
  }
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

function query(text, params){
  return getPool().query(text, params);
}

function emptyWorkspace(){
  return { users: [], brands: [], designs: [], plans: [], notes: [] };
}

async function loadWorkspace(){
  const [users, brands, roles, designs, plans, notes] = await Promise.all([
    query('SELECT id, name, email, kind, master, must_change_password, password_salt, password_hash FROM users ORDER BY position'),
    query(`SELECT id, name, tile, shade, on_shade AS "onShade", mute,
              profile_url AS "profileUrl", profile_label AS "profileLabel",
              profile_handle AS "profileHandle", guide
           FROM brands ORDER BY position`),
    query('SELECT user_id, brand_id, role FROM roles'),
    query('SELECT body FROM designs ORDER BY position'),
    query('SELECT body FROM plans ORDER BY position'),
    query('SELECT body FROM notes ORDER BY position')
  ]);
  const roleMap = new Map();
  roles.rows.forEach(row => {
    if (!roleMap.has(row.user_id)) roleMap.set(row.user_id, {});
    roleMap.get(row.user_id)[row.brand_id] = row.role;
  });
  return {
    users: users.rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      kind: row.kind === 'client' ? 'client' : 'agency',
      master: !!row.master,
      mustChangePassword: !!row.must_change_password,
      passwordSalt: row.password_salt,
      passwordHash: row.password_hash,
      roles: roleMap.get(row.id) || {}
    })),
    brands: brands.rows.map(row => ({
      id: row.id,
      name: row.name,
      tile: row.tile,
      shade: row.shade,
      onShade: row.onShade,
      mute: row.mute,
      profileUrl: row.profileUrl,
      profileLabel: row.profileLabel,
      profileHandle: row.profileHandle,
      guide: row.guide || {}
    })),
    designs: designs.rows.map(row => row.body),
    plans: plans.rows.map(row => row.body),
    notes: notes.rows.map(row => row.body)
  };
}

async function saveWorkspace(ws){
  const workspace = ws || emptyWorkspace();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(81421)');
    await client.query('DELETE FROM roles');
    await client.query('DELETE FROM designs');
    await client.query('DELETE FROM plans');
    await client.query('DELETE FROM notes');
    await client.query('DELETE FROM brands');
    await client.query('DELETE FROM users');
    for (let i = 0; i < (workspace.users || []).length; i++) {
      const user = workspace.users[i];
      if (!user || !user.id) continue;
      await client.query(
        `INSERT INTO users (id, position, name, email, kind, master, must_change_password, password_salt, password_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          user.id, i, String(user.name || '').slice(0, 80), String(user.email || '').toLowerCase(),
          user.kind === 'client' ? 'client' : 'agency', !!user.master, !!user.mustChangePassword,
          user.passwordSalt || '', user.passwordHash || ''
        ]
      );
    }
    for (let i = 0; i < (workspace.brands || []).length; i++) {
      const brand = workspace.brands[i];
      if (!brand || !brand.id) continue;
      await client.query(
        `INSERT INTO brands (id, position, name, tile, shade, on_shade, mute, profile_url, profile_label, profile_handle, guide)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
        [
          brand.id, i, String(brand.name || '').slice(0, 80), brand.tile || '', brand.shade || '#B9DEFF',
          brand.onShade || '#10141A', brand.mute || '#1F3152', brand.profileUrl || '', brand.profileLabel || '',
          brand.profileHandle || '', JSON.stringify(brand.guide || {})
        ]
      );
    }
    const brandIds = new Set((workspace.brands || []).map(brand => brand && brand.id).filter(Boolean));
    for (const user of workspace.users || []) {
      const roles = user && user.roles || {};
      for (const [brandId, role] of Object.entries(roles)) {
        if (!brandId || !role || !brandIds.has(brandId)) continue;
        await client.query(
          'INSERT INTO roles (user_id, brand_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [user.id, brandId, role]
        );
      }
    }
    for (let i = 0; i < (workspace.designs || []).length; i++) {
      const design = workspace.designs[i];
      if (!design || !design.id) continue;
      await client.query(
        'INSERT INTO designs (id, position, brand_id, body) VALUES ($1,$2,$3,$4::jsonb)',
        [design.id, i, design.brandId || null, JSON.stringify(design)]
      );
    }
    for (let i = 0; i < (workspace.plans || []).length; i++) {
      const plan = workspace.plans[i];
      if (!plan || !plan.id) continue;
      await client.query(
        'INSERT INTO plans (id, position, brand_id, body) VALUES ($1,$2,$3,$4::jsonb)',
        [plan.id, i, plan.brandId || null, JSON.stringify(plan)]
      );
    }
    for (let i = 0; i < (workspace.notes || []).length; i++) {
      const note = workspace.notes[i];
      if (!note || !note.id) continue;
      await client.query(
        'INSERT INTO notes (id, position, body) VALUES ($1,$2,$3::jsonb)',
        [note.id, i, JSON.stringify(note)]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function close(){
  if (pool) await pool.end();
  pool = null;
}

module.exports = { query, loadWorkspace, saveWorkspace, emptyWorkspace, close };
