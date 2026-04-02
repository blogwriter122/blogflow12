export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { wpUrl, wpUser, wpPass, title, content, status } = req.body;

  if (!wpUrl || !wpUser || !wpPass) {
    return res.status(400).json({ error: 'Missing WordPress credentials' });
  }

  const endpoint = wpUrl.replace(/\/+$/, '') + '/wp-json/wp/v2/posts';

  // Server-side btoa avoids all browser encoding issues
  const auth = Buffer.from(wpUser + ':' + wpPass).toString('base64');

  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + auth,
        'User-Agent': 'BlogEngine/2.0',
      },
      body: JSON.stringify({ title, content, status: status || 'draft' }),
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({
        error: data.message || `HTTP ${r.status}`,
        code: data.code || '',
        status: r.status,
      });
    }

    return res.status(200).json({ success: true, link: data.link, id: data.id });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
