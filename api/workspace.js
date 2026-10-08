const store = require('../lib/store');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const found = await store.actorFrom(req);
      if (!found || !found.user) return res.status(401).json({ error: 'Sign in required.' });
      return res.status(200).json({ user: store.publicUser(found.user), workspace: store.viewFor(found.user, found.ws) });
    }
    if (req.method === 'PUT') {
      const found = await store.actorFrom(req);
      if (!found || !found.user) return res.status(401).json({ error: 'Sign in required.' });
      const body = store.readBody(req);
      const ws = await store.update(current => store.applyIncoming(current, body, found.user));
      const user = ws.users.find(u => u.id === found.user.id) || found.user;
      return res.status(200).json({ user: store.publicUser(user), workspace: store.viewFor(user, ws) });
    }
    return res.status(405).json({ error: 'GET or PUT only' });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: status === 503 ? 'The workspace is not ready yet.' : 'Could not save the workspace.' });
  }
};
