// Vercel serverless function — generate carousel slides from transcript
// Hosts the Anthropic API key server-side; rate-limits 5 carousels/IP/day

// Module-level rate limit map (resets on cold starts — fine for MVP)
const rateLimitMap = new Map();

function getRateKey(ip) {
  return `${ip}:${new Date().toISOString().slice(0, 10)}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Rate limiting
  const ip = (req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const key = getRateKey(ip);
  const count = rateLimitMap.get(key) || 0;

  if (count >= 5) {
    return res.status(429).json({
      error: 'Daily limit reached',
      hint: "You've used your 5 free carousels for today. Come back tomorrow!",
    });
  }

  rateLimitMap.set(key, count + 1);

  // Prune old entries to keep map from growing unbounded
  if (rateLimitMap.size > 10000) {
    const today = new Date().toISOString().slice(0, 10);
    for (const k of rateLimitMap.keys()) {
      if (!k.includes(today)) rateLimitMap.delete(k);
    }
  }

  // ── Parse body
  const { transcript } = req.body || {};
  if (!transcript || transcript.trim().length < 50) {
    return res.status(400).json({ error: 'Transcript is too short — paste more content.' });
  }

  // ── Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Service temporarily unavailable.' });
  }

  const capped = transcript.trim().slice(0, 12000);

  // ── Call Claude
  let claudeRes;
  try {
    claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: 'You are an expert social media content strategist. Respond with valid JSON only — no markdown fences, no explanation text.',
        messages: [{
          role: 'user',
          content: `Convert this YouTube transcript into a LinkedIn carousel.

<transcript>${capped}</transcript>

Create 6–8 slides:
- Slide 1: Hook — bold enough to stop the scroll
- Middle slides: One concrete insight each, pulled directly from this video (not generic advice)
- Last slide: Takeaway or CTA

Each slide:
- headline: max 8 words, punchy and specific
- body: 2–3 concrete sentences, no filler
- stat: a compelling quote, data point, or stat from the video — or null
- imageQuery: 2-3 word phrase for a relevant stock photo concept (e.g. "focused developer laptop", "team whiteboard meeting", "startup growth momentum")

Return only this JSON (no other text):
{"title":"...","slides":[{"headline":"...","body":"...","stat":null,"imageQuery":"..."}]}`,
        }],
      }),
    });
  } catch (err) {
    console.error('[generate] fetch error:', err.message);
    return res.status(502).json({ error: 'Failed to reach AI service — please try again.' });
  }

  if (claudeRes.status === 429) {
    return res.status(429).json({ error: 'AI rate limit hit — try again in a moment.' });
  }
  if (!claudeRes.ok) {
    const errData = await claudeRes.json().catch(() => ({}));
    console.error('[generate] Claude error:', claudeRes.status, errData);
    return res.status(claudeRes.status).json({ error: errData?.error?.message || `AI error ${claudeRes.status}` });
  }

  const data = await claudeRes.json();
  const raw = data.content?.[0]?.text;
  if (!raw) return res.status(500).json({ error: 'Empty response from AI.' });

  // Strip any accidental markdown fences
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error('[generate] JSON parse error:', e.message, 'raw:', cleaned.slice(0, 200));
    return res.status(500).json({ error: 'AI returned an unexpected format — please try again.' });
  }

  if (!Array.isArray(parsed.slides) || parsed.slides.length < 2) {
    return res.status(500).json({ error: 'Not enough slides generated — please try again.' });
  }

  return res.status(200).json(parsed);
};
