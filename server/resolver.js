const https = require('https');
const http = require('http');
const { extractVideoId } = require('./utils');

/**
 * Detect if a URL is a channel live URL (no fixed video ID)
 * e.g. https://www.youtube.com/@channelname/live
 *      https://www.youtube.com/@channelname/streams
 *      https://www.youtube.com/channel/UCxxxxxxx/live
 *      https://www.youtube.com/c/channelname/live
 */
function isChannelLiveUrl(url) {
  if (!url) return false;
  if (extractVideoId(url)) return false; // Already has a video ID
  return /youtube\.com\/(@[^/]+|channel\/[^/]+|c\/[^/]+)\/(live|streams)/.test(url);
}

/**
 * Fetch the current Video ID for a channel live URL.
 * Supports both /@channel/live (redirect-based) and /@channel/streams (live badge scan).
 */
function resolveChannelVideoId(channelLiveUrl) {
  // For /streams URLs: fetch the streams page and return the first live stream's videoId
  if (/\/(streams)$/.test(channelLiveUrl)) {
    const handleMatch = channelLiveUrl.match(/youtube\.com\/((?:@|channel\/|c\/)[^/?]+)/);
    const handle = handleMatch ? handleMatch[1] : null;
    if (!handle) return Promise.resolve(null);
    return fetchChannelLiveStreams(handle).then(streams => streams.length > 0 ? streams[0].videoId : null);
  }

  // For /live URLs: follow redirects
  return new Promise((resolve) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 12000,
    };

    function fetchUrl(url, redirectCount) {
      if (redirectCount > 5) { resolve(null); return; }

      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, options, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : `https://www.youtube.com${res.headers.location}`;
          res.resume();
          const directId = extractVideoId(next);
          if (directId) { resolve(directId); return; }
          fetchUrl(next, redirectCount + 1);
          return;
        }

        let data = '';
        let found = false;
        res.on('data', (chunk) => {
          if (found) return;
          data += chunk;
          const match = data.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
          if (match) {
            found = true;
            resolve(match[1]);
            res.destroy();
          } else if (data.length > 800000) {
            res.destroy();
            resolve(null);
          }
        });
        res.on('end', () => { if (!found) resolve(null); });
        res.on('close', () => { if (!found) resolve(null); });
      });

      req.setTimeout(12000, () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    }

    fetchUrl(channelLiveUrl, 0);
  });
}

/**
 * Fetch the stream title and channel handle for a known video ID.
 * Used when adding a new nest so we can store metadata for auto-recovery.
 */
function fetchVideoInfo(videoId) {
  return new Promise((resolve) => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 12000,
    };

    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
        if (data.length > 500000) res.destroy();
      });

      const extract = () => {
        // Channel handle: "canonicalBaseUrl":"/@handle"
        const handleMatch = data.match(/"canonicalBaseUrl":"(\/[^"]+)"/);
        let channelHandle = '';
        if (handleMatch) {
          // Extract just the @handle part from paths like "/@handle"
          const hm = handleMatch[1].match(/\/(@[^/?]+)/);
          if (hm) channelHandle = hm[1];
        }

        // Stream title from videoDetails
        const titleMatch = data.match(/"videoDetails":\{"videoId":"[^"]+","title":"([^"]+)"/);
        const streamTitle = titleMatch ? titleMatch[1].replace(/\\u0026/g, '&').replace(/\\"/g, '"') : '';

        resolve({ channelHandle, streamTitle });
      };

      res.on('end', extract);
      res.on('close', extract);
    });

    req.setTimeout(12000, () => { req.destroy(); resolve({ channelHandle: '', streamTitle: '' }); });
    req.on('error', () => resolve({ channelHandle: '', streamTitle: '' }));
  });
}

/**
 * Parse live streams from a channel's /streams page HTML.
 * Returns an array of { videoId, title } for streams currently marked LIVE.
 */
function parseLiveStreams(html) {
  const seen = new Set();
  const results = [];

  // Find each LIVE badge, then look backwards for the nearest videoId + title
  const liveMarkers = ['BADGE_STYLE_TYPE_LIVE_NOW', '"style":"LIVE"', '"isLive":true'];
  let pos = 0;

  while (pos < html.length) {
    // Find the next LIVE marker
    let liveIdx = -1;
    for (const marker of liveMarkers) {
      const idx = html.indexOf(marker, pos);
      if (idx !== -1 && (liveIdx === -1 || idx < liveIdx)) liveIdx = idx;
    }
    if (liveIdx === -1) break;
    pos = liveIdx + 1;

    // Look backwards up to 15KB for title key, then find videoId before it
    const searchStart = Math.max(0, liveIdx - 15000);
    const before = html.slice(searchStart, liveIdx);

    // Find the LAST "title": key before the LIVE badge — this is the videoRenderer's title
    const titleKeyIdx = before.lastIndexOf('"title":');
    if (titleKeyIdx === -1) continue;

    // Extract the title text from that position (look ahead up to 300 chars)
    const titleSection = before.slice(titleKeyIdx, titleKeyIdx + 300);
    const titleTextMatch = titleSection.match(/"text":"((?:[^"\\]|\\.)*)"/);
    if (!titleTextMatch) continue;

    const rawTitle = titleTextMatch[1];
    // Rule out video IDs and very short UI labels
    if (rawTitle.length < 4 || /^[a-zA-Z0-9_-]{11}$/.test(rawTitle)) continue;

    // Find the last videoId BEFORE the title key position
    const beforeTitle = before.slice(0, titleKeyIdx);
    const videoIdRegex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
    let lastVidMatch = null, m;
    while ((m = videoIdRegex.exec(beforeTitle)) !== null) lastVidMatch = m;
    if (!lastVidMatch) continue;

    const videoId = lastVidMatch[1];
    if (seen.has(videoId)) continue;
    seen.add(videoId);

    const title = rawTitle.replace(/\\u0026/g, '&').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    results.push({ videoId, title });
  }

  return results;
}

/**
 * Fetch the current live streams from a channel's /streams page.
 */
function fetchChannelLiveStreams(channelHandle) {
  return new Promise((resolve) => {
    if (!channelHandle) { resolve([]); return; }
    const url = `https://www.youtube.com/${channelHandle}/streams`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
    };

    const req = https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve([]);
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
        if (data.length > 1200000) res.destroy();
      });
      const done = () => {
        const checks = ['BADGE_STYLE_TYPE_LIVE_NOW','"isLive":true','"isLiveNow":true','LIVE_NOW','"style":"LIVE"','thumbnailOverlayLiveChatRenderer','liveBroadcastDetails'].map(k => `${k}=${data.includes(k)}`).join(' ');
        console.log(`[fetchChannelLiveStreams] ${channelHandle} pageSize=${data.length} ${checks}`);
        resolve(parseLiveStreams(data));
      };
      res.on('end', done);
      res.on('close', done);
    });

    req.setTimeout(15000, () => { req.destroy(); resolve([]); });
    req.on('error', () => resolve([]));
  });
}

/**
 * Score title similarity using keyword overlap (stop-word filtered).
 * Returns 0–1; ≥0.5 is considered a match.
 */
function titleSimilarity(t1, t2) {
  if (!t1 || !t2) return 0;
  const stop = new Set(['the','a','an','of','in','on','at','for','with','and','or','to','is',
    'live','stream','cam','camera','nest','bird','watch','view','feed','channel','hd']);
  const keywords = (t) => t.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !stop.has(w));
  const k1 = new Set(keywords(t1));
  const k2 = new Set(keywords(t2));
  if (k1.size === 0 || k2.size === 0) return 0;
  let overlap = 0;
  for (const w of k1) if (k2.has(w)) overlap++;
  return overlap / Math.min(k1.size, k2.size);
}

/**
 * Try to find a currently-live stream on the channel that matches the stored title.
 * Returns { videoId, title, score } if found, or null.
 */
async function findMatchingStream(channelHandle, storedTitle, threshold = 0.5) {
  if (!channelHandle) return null;
  const liveStreams = await fetchChannelLiveStreams(channelHandle);
  if (liveStreams.length === 0) return null;

  let best = null;
  for (const stream of liveStreams) {
    const score = titleSimilarity(storedTitle, stream.title);
    if (score >= threshold && (!best || score > best.score)) {
      best = { ...stream, score };
    }
  }
  return best;
}

module.exports = { isChannelLiveUrl, resolveChannelVideoId, fetchVideoInfo, findMatchingStream, fetchChannelLiveStreams };
