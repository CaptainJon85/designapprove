require('../../../scripts/load-env');
const fs = require('fs');
const path = require('path');
const express = require('express');
const login = require('./login');
const logout = require('./logout');
const password = require('./password');
const users = require('./users');
const workspace = require('./workspace');
const logo = require('./logo');
const notify = require('./notify');
const files = require('./files');
const db = require('@proofline/db');
const storage = require('@proofline/storage');

const app = express();
app.use(express.json({ limit: '12mb' }));

app.get('/', (req, res) => res.status(200).json({ ok: true }));

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    await storage.ensureBucket();
    return res.status(200).json({ ok: true, db: true, storage: true });
  } catch (err) {
    return res.status(503).json({ ok: false, error: err.message || 'Not ready' });
  }
});

app.get(/^\/api\/files\/(.+)$/, (req, res) => {
  req.params = { key: req.params[0] };
  return files(req, res);
});
app.all('/api/login', login);
app.all('/api/logout', logout);
app.all('/api/password', password);
app.all('/api/users', users);
app.all('/api/workspace', workspace);
app.all('/api/logo', logo);
app.all('/api/notify', notify);

const port = Number(process.env.PORT || process.env.API_PORT || 3001);

async function boot(){
  const schema = fs.readFileSync(path.join(__dirname, '../../../packages/db/schema.sql'), 'utf8');
  await db.query(schema);
  app.listen(port, '0.0.0.0', () => {
    console.log('API listening on 0.0.0.0:' + port);
  });
}

boot().catch(err => {
  console.error(err);
  process.exit(1);
});
