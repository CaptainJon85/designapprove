const store = require('../lib/store');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  res.setHeader('Set-Cookie', store.sessionCookie('', 0));
  return res.status(200).json({ ok: true });
};
