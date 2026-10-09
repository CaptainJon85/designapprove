const store = require('./store');
const logo = require('./fetch-logo');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const found = await store.actorFrom(req);
    if (!found || !found.user) return res.status(401).json({ error: 'Sign in required.' });
    if (!store.isAdmin(found.user)) return res.status(403).json({ error: 'Only an admin can add a brand.' });
    const body = store.readBody(req);
    const result = await logo.fetchLogo(body.url || body.link || '');
    return res.status(200).json(result);
  } catch (err) {
    const status = err.status || 500;
    const payload = { error: err.status ? err.message : 'Could not fetch a logo from that page.' };
    if (err.profileUrl) {
      payload.profileUrl = err.profileUrl;
      payload.profileLabel = err.profileLabel || '';
      payload.handle = err.handle || '';
    }
    return res.status(status).json(payload);
  }
};
