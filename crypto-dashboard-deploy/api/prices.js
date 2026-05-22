// Vercel serverless function: server-side proxy for CoinGecko's batch endpoint.
//
// Why this exists: CoinGecko aggressively rate-limits the free tier when the
// browser's Origin/Referer is a *.vercel.app domain. Calling CoinGecko from
// Vercel's Node runtime (server-side) doesn't carry the browser Origin, so
// we get our full quota. The dashboard then calls /api/prices same-origin,
// which means no CORS and no per-domain rate-limit hit.
//
// Usage: GET /api/prices?ids=bitcoin,ethereum,solana
//
// Caches each response at the Vercel edge for 60s and serves stale up to 5min
// while revalidating in the background.

export default async function handler(req, res) {
  try {
    const ids = (req.query.ids || '').trim();
    if (!ids) {
      return res.status(400).json({ error: 'missing ids param' });
    }
    // Sanity-check: only allow lowercase letters, digits, dashes, commas
    if (!/^[a-z0-9,\-]+$/i.test(ids)) {
      return res.status(400).json({ error: 'invalid ids format' });
    }

    const url = `https://api.coingecko.com/api/v3/coins/markets`
      + `?vs_currency=usd&ids=${encodeURIComponent(ids)}`
      + `&per_page=250&price_change_percentage=24h&sparkline=false`;

    const upstream = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'crypto-dashboard/1.0 (+vercel-serverless)'
      }
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: 'upstream failed',
        status: upstream.status,
        statusText: upstream.statusText
      });
    }

    const data = await upstream.json();

    // Cache at the edge: fresh for 60s, stale-while-revalidate for 5min
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(data);

  } catch (err) {
    console.error('api/prices error:', err);
    return res.status(500).json({ error: err.message || 'internal error' });
  }
}
