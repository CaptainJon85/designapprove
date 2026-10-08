const store = require('../lib/store');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = store.readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const ws = await store.load();
    const user = ws.users.find(u => String(u.email || '').toLowerCase() === email);
    if (!user || !store.passwordOk(password, user)) {
      return res.status(401).json({ error: 'Email or password doesn’t match.' });
    }
    const token = store.signSession(user);
    res.setHeader('Set-Cookie', store.sessionCookie(token, 14 * 24 * 60 * 60));
    return res.status(200).json({ user: store.publicUser(user), workspace: store.viewFor(user, ws) });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: status === 503 ? 'The workspace is not ready yet.' : 'Could not sign in.' });
  }
};
