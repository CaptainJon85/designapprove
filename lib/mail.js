// Sends through Resend. RESEND_API_KEY is set on the Vercel project.
// NOTIFY_FROM is optional. The default sender is on proofline.ojsolutions.io.

function signInUrl(req) {
  const headers = (req && req.headers) || {};
  const host = String(headers['x-forwarded-host'] || headers.host || '').split(',')[0].trim();
  if (host && host !== 'localhost' && !host.endsWith('.vercel.app')) {
    const proto = String(headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
    return proto + '://' + host;
  }
  return 'https://proofline.ojsolutions.io';
}

function inviteText({ name, email, password, kind, url }) {
  const roleLine = kind === 'client'
    ? 'You have been added to Proofline as a client.'
    : 'You have been added to the Proofline agency team.';
  return [
    'Hi ' + name + ',',
    '',
    roleLine,
    'Sign in with the temporary password below. The first time you sign in, Proofline will ask you to choose a new password.',
    '',
    'Sign in: ' + url,
    'Email: ' + email,
    'Temporary password: ' + password
  ].join('\n');
}

async function sendMail({ to, subject, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, queued: true, reason: 'missing_key' };
  const from = process.env.NOTIFY_FROM || 'Proofline <notifications@proofline.ojsolutions.io>';
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { sent: false, queued: true, error: data.message || 'Email provider declined' };
    return { sent: true, id: data.id || '' };
  } catch (err) {
    return { sent: false, queued: true };
  }
}

module.exports = { sendMail, signInUrl, inviteText };
