// Vercel serverless function — YouTube transcript fetcher
// Strategy 1: youtube-transcript npm package (battle-tested)
// Strategy 2: Page scrape with raw caption URL (no fmt modification)
// Strategy 3: WEB Innertube with visitorData
// Strategy 4: MWEB Innertube (mobile web client)
// Strategy 5: Timedtext direct

let YoutubeTranscript; try { YoutubeTranscript = require('youtube-transcript').YoutubeTranscript; } catch(e) {}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
};

function abortFetch(url, opts = {}, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

function parseXML(xml) {
  const texts = [];
  const re = /<text[^>]*>([\s\S]*?)<\/text>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const t = m[1]
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
      .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\n/g,' ').trim();
    if (t) texts.push(t);
  }
  return texts.join(' ');
}
function parseVTT(vtt) {
  const texts = []; let inCue = false;
  for (const line of vtt.split('\n')) {
    const t = line.trim();
    if (!t || t === 'WEBVTT') { inCue = false; continue; }
    if (t.includes('-->')) { inCue = true; continue; }
    if (inCue && t) { const c = t.replace(/<[^>]+>/g,'').trim(); if (c) texts.push(c); }
  }
  return texts.join(' ');
}
function parseJSON3(text) {
  try {
    const d = JSON.parse(text);
    if (d.events) return d.events.filter(e=>e.segs).map(e=>e.segs.map(s=>s.utf8||'').join('')).join(' ').replace(/\n/g,' ').replace(/ {2,}/g,' ').trim();
  } catch {}
  return null;
}
function pickTrack(tracks) {
  return tracks.find(t=>t.languageCode==='en'&&t.kind==='asr')
      || tracks.find(t=>t.languageCode==='en')
      || tracks.find(t=>t.languageCode?.startsWith('en'))
      || tracks[0];
}

// ── Strategy 1: youtube-transcript package
async function tryYoutubeTranscriptPkg(videoId) {
  const items = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
  if (!items?.length) throw new Error('Package returned no items');
  const transcript = items.map(i => i.text).join(' ').replace(/\s+/g,' ').trim();
  if (transcript.length < 30) throw new Error('Package transcript too short');
  return { transcript, language: 'en' };
}

// ── Strategy 2: Page scrape — use raw caption URL (no fmt modification)
async function tryPageScrapeRaw(videoId) {
  const res = await abortFetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'CONSENT=YES+cb',
    },
  }, 15000);

  if (!res.ok) throw new Error(`Watch page ${res.status}`);
  const html = await res.text();
  if (html.length < 5000) throw new Error('Page too short');
  if (html.includes('consent.youtube.com')) throw new Error('Consent redirect');

  const split = html.split('"captions":');
  if (split.length <= 1) throw new Error('No captions data in page');

  let captions;
  try {
    captions = JSON.parse(split[1].split(',"videoDetails')[0].replace(/\n/g, ''));
  } catch {
    throw new Error('Failed to parse captions JSON');
  }

  const tracks = captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (!tracks.length) throw new Error('No caption tracks found');

  const track = pickTrack(tracks);
  const captionUrl = track.baseUrl;

  const cr = await abortFetch(captionUrl, {
    headers: {
      'Accept-Language': 'en-US',
      'Referer': `https://www.youtube.com/watch?v=${videoId}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  }, 8000);

  if (!cr.ok) throw new Error(`Caption ${cr.status}`);
  const text = await cr.text();
  if (!text || text.length < 20) throw new Error(`Caption empty (${text.length} bytes)`);

  let transcript;
  if (text.trimStart().startsWith('WEBVTT')) transcript = parseVTT(text);
  else if (text.includes('<transcript>') || text.includes('<text ')) transcript = parseXML(text);
  else transcript = parseJSON3(text) || parseXML(text);

  if (!transcript || transcript.length < 30) throw new Error('Could not parse captions');
  return { transcript, language: track.languageCode || 'en' };
}

// ── Strategy 3: WEB Innertube with visitorData
async function tryWebWithVisitor(videoId) {
  const homeRes = await abortFetch('https://www.youtube.com/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Cookie': 'CONSENT=YES+cb',
    },
  }, 8000);
  const homeHtml = await homeRes.text();
  const visitorData = homeHtml.match(/"visitorData":"([^"]+)"/)?.[1];

  const res = await abortFetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'X-YouTube-Client-Name': '1',
      'X-YouTube-Client-Version': '2.20240101.00.00',
      'Origin': 'https://www.youtube.com',
      'Referer': `https://www.youtube.com/watch?v=${videoId}`,
      ...(visitorData ? { 'X-Goog-Visitor-Id': visitorData } : {}),
    },
    body: JSON.stringify({
      videoId,
      context: {
        client: {
          clientName: 'WEB', clientVersion: '2.20240101.00.00',
          hl: 'en', gl: 'US',
          ...(visitorData ? { visitorData } : {}),
        },
      },
    }),
  }, 12000);

  if (!res.ok) throw new Error(`WEB Innertube ${res.status}`);
  const data = await res.json();
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (!tracks.length) throw new Error('No captions (WEB Innertube)');
  const track = pickTrack(tracks);
  const cr = await abortFetch(track.baseUrl, { headers: { 'Accept-Language': 'en-US' } }, 8000);
  if (!cr.ok) throw new Error(`Caption ${cr.status}`);
  const text = await cr.text();
  const transcript = parseJSON3(text) || parseXML(text) || parseVTT(text);
  if (!transcript || transcript.length < 30) throw new Error('Transcript too short');
  return { transcript, language: track.languageCode };
}

// ── Strategy 4: MWEB Innertube (mobile web — different IP treatment)
async function tryMWeb(videoId) {
  const res = await abortFetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      'X-YouTube-Client-Name': '2',
      'X-YouTube-Client-Version': '2.20230816.00.00',
      'Origin': 'https://www.youtube.com',
      'Referer': `https://www.youtube.com/watch?v=${videoId}`,
    },
    body: JSON.stringify({
      videoId,
      context: {
        client: {
          clientName: 'MWEB',
          clientVersion: '2.20230816.00.00',
          hl: 'en',
          gl: 'US',
        },
      },
    }),
  }, 12000);
  if (!res.ok) throw new Error(`MWEB Innertube ${res.status}`);
  const data = await res.json();
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (!tracks.length) throw new Error('No captions (MWEB)');
  const track = pickTrack(tracks);
  const cr = await abortFetch(track.baseUrl, {
    headers: {
      'Accept-Language': 'en-US',
      'Referer': `https://www.youtube.com/watch?v=${videoId}`,
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    },
  }, 8000);
  if (!cr.ok) throw new Error(`Caption ${cr.status}`);
  const text = await cr.text();
  const transcript = parseJSON3(text) || parseXML(text) || parseVTT(text);
  if (!transcript || transcript.length < 30) throw new Error('Transcript too short (MWEB)');
  return { transcript, language: track.languageCode };
}

// ── Strategy 5: timedtext direct
async function tryTimedtext(videoId) {
  for (const lang of ['en','en-US','en-GB']) {
    try {
      const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&name=`;
      const r = await abortFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US' } }, 8000);
      if (!r.ok) continue;
      const text = await r.text();
      if (!text || text.length < 20) continue;
      const t = parseXML(text) || parseJSON3(text);
      if (t && t.length > 30) return { transcript: t, language: lang };
    } catch {}
  }
  throw new Error('Timedtext returned nothing');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'Missing videoId' });

  const strategies = [
    { name: 'yt-pkg',      fn: () => tryYoutubeTranscriptPkg(videoId) },
    { name: 'page-raw',    fn: () => tryPageScrapeRaw(videoId) },
    { name: 'web+visitor', fn: () => tryWebWithVisitor(videoId) },
    { name: 'mweb',        fn: () => tryMWeb(videoId) },
    { name: 'timedtext',   fn: () => tryTimedtext(videoId) },
  ];

  const errors = [];
  for (const s of strategies) {
    try {
      const { transcript, language } = await s.fn();
      return res.status(200).json({ videoId, language, transcript, wordCount: transcript.split(/\s+/).length, source: s.name });
    } catch (err) {
      errors.push(`${s.name}: ${err.message}`);
      console.error(`[${s.name}]`, err.message);
    }
  }

  return res.status(502).json({
    error: 'All strategies failed', details: errors,
    hint: 'Try a video with auto-generated captions, or paste the transcript manually.',
  });
};
