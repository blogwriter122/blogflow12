// Vercel serverless function — proxies Replicate API to fix CORS
// Deployed automatically at /api/replicate when hosted on Vercel

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, model, input, poll_url } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Missing Replicate token' });
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Prefer': 'wait=60',
  };

  try {
    // If poll_url provided, we are polling an existing prediction
    if (poll_url) {
      const r = await fetch(poll_url, { headers });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    // Otherwise create a new prediction
    // model format: "owner/name" → use /v1/models/owner/name/predictions
    // model format: "owner/name:version" → use /v1/predictions with version field
    let endpoint, body;

    if (model.includes(':')) {
      const version = model.split(':')[1];
      endpoint = 'https://api.replicate.com/v1/predictions';
      body = { version, input };
    } else {
      endpoint = `https://api.replicate.com/v1/models/${model}/predictions`;
      body = { input };
    }

    const r = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await r.json();

    // If still processing, poll until done (max 8 polls × 5s = 40s)
    if (data.status === 'starting' || data.status === 'processing') {
      const pollUrl = data.urls?.get;
      if (pollUrl) {
        for (let i = 0; i < 8; i++) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          const pr = await fetch(pollUrl, { headers });
          const pd = await pr.json();
          if (pd.status === 'succeeded' || pd.status === 'failed' || pd.status === 'canceled') {
            return res.status(200).json(pd);
          }
        }
      }
    }

    return res.status(r.status).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
