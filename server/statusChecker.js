const https = require('https');
const db = require('./db');
const { isChannelLiveUrl, resolveChannelVideoId, findMatchingStream } = require('./resolver');

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

function checkNestOnline(videoId) {
  return new Promise((resolve) => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000,
    };

    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const isLive =
          data.includes('"isLive":true') ||
          data.includes('"isLiveNow":true') ||
          data.includes('"liveBroadcastDetails"');
        resolve(isLive);
      });
    });

    req.setTimeout(10000, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

async function checkAllNests() {
  const nests = db.prepare('SELECT id, video_id, youtube_url, name, channel_handle, stream_title FROM nests').all();
  console.log(`[StatusChecker] Checking ${nests.length} nests...`);

  for (const nest of nests) {
    try {
      // For channel live URLs: re-resolve the current Video ID first
      if (isChannelLiveUrl(nest.youtube_url)) {
        const newVideoId = await resolveChannelVideoId(nest.youtube_url);
        if (newVideoId && newVideoId !== nest.video_id) {
          db.prepare('UPDATE nests SET video_id = ? WHERE id = ?').run(newVideoId, nest.id);
          console.log(`[StatusChecker] ${nest.name}: video ID updated ${nest.video_id} → ${newVideoId}`);
          nest.video_id = newVideoId;
        }
        const isOnline = !!newVideoId;
        db.prepare('UPDATE nests SET is_online = ? WHERE id = ?').run(isOnline ? 1 : 0, nest.id);
        console.log(`[StatusChecker] ${nest.name}: ${isOnline ? 'online' : 'offline'}`);
      } else {
        // Fixed video ID: check if it's still live
        const isOnline = await checkNestOnline(nest.video_id);
        if (isOnline) {
          db.prepare('UPDATE nests SET is_online = 1 WHERE id = ?').run(nest.id);
          console.log(`[StatusChecker] ${nest.name}: online`);
        } else {
          // Stream is offline — try auto-recovery via channel handle + title match
          let recovered = false;
          if (nest.channel_handle && nest.stream_title) {
            const match = await findMatchingStream(nest.channel_handle, nest.stream_title);
            if (match) {
              db.prepare('UPDATE nests SET video_id = ?, is_online = 1 WHERE id = ?').run(match.videoId, nest.id);
              console.log(`[StatusChecker] ${nest.name}: auto-recovered → ${match.videoId} (score ${match.score.toFixed(2)}, "${match.title}")`);
              recovered = true;
            }
          }
          if (!recovered) {
            db.prepare('UPDATE nests SET is_online = 0 WHERE id = ?').run(nest.id);
            console.log(`[StatusChecker] ${nest.name}: offline`);
          }
        }
      }
    } catch (err) {
      console.error(`[StatusChecker] Error checking ${nest.name}:`, err.message);
    }
  }
}

function start() {
  setTimeout(checkAllNests, 10000);
  setInterval(checkAllNests, CHECK_INTERVAL);
  console.log('[StatusChecker] Started, first check in 10 seconds');
}

module.exports = { start, checkAllNests };
