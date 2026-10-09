const store = require('../lib/store');
const mail = require('../lib/mail');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const found = await store.actorFrom(req);
    if (!found || !found.user) return res.status(401).json({ error: 'Sign in required.' });
    if (!store.isAdmin(found.user)) return res.status(403).json({ error: 'Only an admin can add people.' });
    const body = store.readBody(req);
    const name = String(body.name || '').trim().slice(0, 80);
    const email = String(body.email || '').trim().toLowerCase();
    const kind = body.kind === 'client' ? 'client' : 'agency';
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a name and a real email.' });
    }
    if ((found.ws.users || []).some(u => String(u.email || '').toLowerCase() === email)) {
      return res.status(409).json({ error: 'That email is already in the workspace.' });
    }
    const password = store.temporaryPassword();
    const hashed = store.hashPassword(password);
    const emailResult = await mail.sendMail({
      to: email,
      subject: 'Sign in to Proofline',
      text: mail.inviteText({ name, email, password, kind, url: mail.signInUrl(req) })
    });
    if (!emailResult.sent) {
      return res.status(502).json({ error: emailResult.error || 'The sign-in email could not be sent, so this person was not added.' });
    }
    let created = null;
    await store.update(ws => {
      if (ws.users.some(u => String(u.email || '').toLowerCase() === email)) {
        const err = new Error('That email is already in the workspace.');
        err.status = 409;
        throw err;
      }
      const roles = {};
      (ws.brands || []).forEach(b => { roles[b.id] = '—'; });
      created = {
        id: 'u' + Date.now(),
        name,
        email,
        kind,
        master: false,
        mustChangePassword: true,
        roles,
        passwordSalt: hashed.passwordSalt,
        passwordHash: hashed.passwordHash
      };
      ws.users.push(created);
      return ws;
    });
    return res.status(200).json({ user: store.publicUser(created), email: emailResult });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.status ? err.message : 'Could not add that person.' });
  }
};
