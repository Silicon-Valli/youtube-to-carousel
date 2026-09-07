// Vercel serverless function: find a background photo for a slide via Unsplash.
//
//   GET /api/photo?q=handshake+office   -> { photos: [{ id, url, thumb, name, profile, link }] }
//   GET /api/photo?track=<photo id>     -> 204. Triggers Unsplash's download event.
//
// Follows the Unsplash API guidelines: images are hotlinked (never re-hosted),
// photographer + Unsplash credit links carry utm params, and exports trigger
// the download endpoint. Keep those three if you fork this.

const UTM = 'utm_source=reelslide&utm_medium=referral';
const TTL_MS = 60 * 60 * 1000;
const cache = new Map(); // query -> { t, data }. Resets on cold start, which is fine.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return res.status(503).json({ error: 'Photo search is not set up on this deployment.' });
  const headers = { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' };

  // Download tracking (required by Unsplash when a photo is used/exported)
  const track = String(req.query.track || '').trim();
  if (track) {
    if (!/^[A-Za-z0-9_-]{5,40}$/.test(track)) return res.status(400).json({ error: 'Bad photo id' });
    try { await fetch(`https://api.unsplash.com/photos/${track}/download`, { headers }); } catch (_) { /* best effort */ }
    return res.status(204).end();
  }

  const q = String(req.query.q || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (q.length < 2) return res.status(400).json({ error: 'Missing query' });

  const ck = q.toLowerCase();
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < TTL_MS) {
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json(hit.data);
  }

  // Unsplash wants every word to match, so a specific 3-word query can come back
  // empty. Retry with fewer words and any orientation before giving up.
  const words = q.split(' ');
  const attempts = [
    { query: q, squarish: true },
    { query: words.slice(0, 2).join(' '), squarish: false },
    { query: words[0], squarish: false },
  ].filter((a, i, arr) => a.query && arr.findIndex(b => b.query === a.query && b.squarish === a.squarish) === i);

  let results = [];
  for (const a of attempts) {
    let r;
    try {
      const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(a.query)}&per_page=6&content_filter=high${a.squarish ? '&orientation=squarish' : ''}`;
      r = await fetch(url, { headers });
    } catch (err) {
      console.error('[photo] fetch error:', err.message);
      return res.status(502).json({ error: 'Could not reach Unsplash.' });
    }
    if (r.status === 403 || r.status === 429) {
      return res.status(429).json({ error: 'Photo search limit reached for this hour.' });
    }
    if (!r.ok) {
      console.error('[photo] Unsplash error:', r.status);
      return res.status(r.status).json({ error: `Unsplash error ${r.status}` });
    }
    const data = await r.json();
    results = data.results || [];
    if (results.length) break;
  }

  const photos = results.map(p => ({
    id: p.id,
    url: p.urls?.regular,                       // 1080px wide, hotlinked
    thumb: p.urls?.small,
    name: p.user?.name || 'Unsplash photographer',
    profile: `${p.user?.links?.html || 'https://unsplash.com'}?${UTM}`,
    link: `${p.links?.html || 'https://unsplash.com'}?${UTM}`,
  })).filter(p => p.url);

  const out = { photos };
  cache.set(ck, { t: Date.now(), data: out });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
  return res.status(200).json(out);
};
