const storage = require('@proofline/storage');

module.exports = async (req, res) => {
  const key = decodeURIComponent(String(req.params.key || ''));
  if (!/^media\/[a-f0-9]{32}\.[a-z0-9]+$/.test(key)) {
    return res.status(404).json({ error: 'File not found.' });
  }
  try {
    const file = await storage.get(key);
    if (!file) return res.status(404).json({ error: 'File not found.' });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(200).end(file.body);
  } catch (err) {
    return res.status(err.status || 500).json({ error: 'Could not read that file.' });
  }
};
