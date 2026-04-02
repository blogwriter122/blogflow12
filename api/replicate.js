export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, model, input } = req.body;

  if (!token) return res.status(400).json({ error: 'Missing Replicate token' });
  if (!model) return res.status(400).json({ error: 'Missing model' });
  if (!input)  return res.status(400).json({ error: 'Missing input' });

  const AUTH = `Bearer ${token}`;

  try {
    // Step 1 — create prediction with Prefer:wait so fast models return immediately
    const endpoint = model.includes(':')
      ? 'https://api.replicate.com/v1/predictions'
      : `https://api.replicate.com/v1/models/${model}/predictions`;

    const body = model.includes(':')
      ? { version: model.split(':')[1], input }
      : { input };

    const createRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': AUTH,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify(body),
    });

    const prediction = await createRes.json();

    // Already done (Prefer:wait worked for fast models like z-image-turbo)
    if (prediction.status === 'succeeded') {
      return res.status(200).json(prediction);
    }

    // Step 2 — poll if still processing (slower models)
    const pollUrl = prediction.urls?.get;
    if (!pollUrl) {
      return res.status(200).json(prediction);
    }

    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const pollRes = await fetch(pollUrl, {
        headers: { 'Authorization': AUTH },
      });
      const polled = await pollRes.json();
      if (
        polled.status === 'succeeded' ||
        polled.status === 'failed' ||
        polled.status === 'canceled'
      ) {
        return res.status(200).json(polled);
      }
    }

    // Timed out
    return res.status(200).json({ status: 'failed', error: 'Timed out waiting for image' });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
