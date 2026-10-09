const store = require('./store');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const found = await store.actorFrom(req);
    if (!found || !found.user) return res.status(401).json({ error: 'Sign in required.' });
    if (!found.user.mustChangePassword) return res.status(400).json({ error: 'Your password is already set.' });
    const body = store.readBody(req);
    const password = String(body.password || '');
    if (password.length < 8) return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
    if (store.passwordOk(password, found.user)) {
      return res.status(400).json({ error: 'Choose a password that is different from the temporary one.' });
    }
    const hashed = store.hashPassword(password);
    let updated = null;
    await store.update(ws => {
      const user = ws.users.find(u => u.id === found.user.id);
      if (!user) {
        const err = new Error('Sign in required.');
        err.status = 401;
        throw err;
      }
      user.passwordSalt = hashed.passwordSalt;
      user.passwordHash = hashed.passwordHash;
      user.mustChangePassword = false;
      updated = user;
      return ws;
    });
    return res.status(200).json({ user: store.publicUser(updated) });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.status ? err.message : 'Could not save the new password.' });
  }
};
