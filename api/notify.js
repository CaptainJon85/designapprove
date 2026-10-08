// Delivers the designer email. Set RESEND_API_KEY and NOTIFY_FROM on Vercel.
// NOTIFY_FROM must be a sender Resend has verified, for example "Proofline <reviews@yourdomain.com>".
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

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(200).json({ sent: false, queued: true });

  const from = process.env.NOTIFY_FROM || 'Proofline <onboarding@resend.dev>';
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(200).json({ sent: false, queued: true, error: data.message || 'Email provider declined' });
    return res.status(200).json({ sent: true, id: data.id || '' });
  } catch (err) {
    return res.status(200).json({ sent: false, queued: true });
  }
};
