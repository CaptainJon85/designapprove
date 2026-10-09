const { sendMail } = require('../lib/mail');

// Delivers the designer email. Set RESEND_API_KEY on Vercel.
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ sent: false, error: 'POST only' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const to = String(body.to || '').trim();
  const subject = String(body.subject || 'New comment on Proofline').slice(0, 180);
  const text = String(body.text || '').slice(0, 4000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !text) {
    return res.status(400).json({ sent: false, error: 'Need a designer email and a comment' });
  }

  return res.status(200).json(await sendMail({ to, subject, text }));
};
