const express = require('express');
const router = express.Router();
const db = require('../db');
const { extractVideoId } = require('../utils');
const { isChannelLiveUrl, resolveChannelVideoId, fetchVideoInfo } = require('../resolver');

// GET all nests (with tags, applying saved view order)
router.get('/', (req, res) => {
  const { filter, tag, species, view_key } = req.query;

  let where = [];
  if (filter === 'favorite') where.push('n.is_favorite = 1');
  if (filter === 'online') where.push('n.is_online = 1');
  if (tag) where.push(`n.id IN (SELECT nest_id FROM nest_tags WHERE tag_id = ${parseInt(tag)})`);
  if (species) where.push(`n.species = ?`);

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const queryParams = species ? [species] : [];
  let nests = db.prepare(`
    SELECT * FROM nests n ${whereClause}
    ORDER BY n.is_favorite DESC, n.created_at DESC
  `).all(...queryParams);

  // Apply saved view order if view_key provided
  if (view_key) {
    const ordered = db.prepare(`
      SELECT nest_id FROM view_orders WHERE view_key = ? ORDER BY position ASC
    `).all(view_key).map(r => r.nest_id);

    if (ordered.length > 0) {
      const orderMap = {};
      ordered.forEach((id, i) => { orderMap[id] = i; });
      nests.sort((a, b) => {
        const pa = orderMap[a.id] !== undefined ? orderMap[a.id] : 9999;
        const pb = orderMap[b.id] !== undefined ? orderMap[b.id] : 9999;
        return pa - pb;
      });
    }
  }

  // Attach tags to each nest
  const nestIds = nests.map(n => n.id);
  if (nestIds.length > 0) {
    const tags = db.prepare(`
      SELECT nt.nest_id, t.id, t.name, t.color
      FROM nest_tags nt
      JOIN tags t ON t.id = nt.tag_id
      WHERE nt.nest_id IN (${nestIds.map(() => '?').join(',')})
    `).all(...nestIds);

    const tagMap = {};
    for (const t of tags) {
      if (!tagMap[t.nest_id]) tagMap[t.nest_id] = [];
      tagMap[t.nest_id].push({ id: t.id, name: t.name, color: t.color });
    }
    for (const nest of nests) {
      nest.tags = tagMap[nest.id] || [];
    }
  } else {
    for (const nest of nests) nest.tags = [];
  }

  res.json(nests);
});

// GET distinct species
router.get('/species', (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT species FROM nests
    WHERE species IS NOT NULL AND species != ''
    ORDER BY species
  `).all();
  res.json(rows.map(r => r.species));
});

// POST create nest
router.post('/', async (req, res) => {
  const { name, youtube_url, species, location, notes, tag_ids } = req.body;

  if (!name || !youtube_url) {
    return res.status(400).json({ error: 'name and youtube_url are required' });
  }

  let video_id = extractVideoId(youtube_url);

  // Support channel live URLs (e.g. https://www.youtube.com/@channelname/live)
  if (!video_id && isChannelLiveUrl(youtube_url)) {
    video_id = await resolveChannelVideoId(youtube_url);
  }

  if (!video_id) {
    return res.status(400).json({ error: 'Invalid YouTube URL, or channel is not currently live' });
  }

  // Fetch channel handle + stream title for auto-recovery later
  const { channelHandle, streamTitle } = await fetchVideoInfo(video_id);

  const stmt = db.prepare(`
    INSERT INTO nests (name, youtube_url, video_id, species, location, notes, channel_handle, stream_title)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(name, youtube_url, video_id, species || '', location || '', notes || '', channelHandle, streamTitle);
  const nestId = result.lastInsertRowid;

  if (tag_ids && tag_ids.length > 0) {
    const insertTag = db.prepare('INSERT OR IGNORE INTO nest_tags (nest_id, tag_id) VALUES (?, ?)');
    for (const tid of tag_ids) insertTag.run(nestId, tid);
  }

  const nest = db.prepare('SELECT * FROM nests WHERE id = ?').get(nestId);
  nest.tags = db.prepare(`
    SELECT t.id, t.name, t.color FROM nest_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.nest_id = ?
  `).all(nestId);

  res.status(201).json(nest);
});

// PUT update nest
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, youtube_url, species, location, notes, is_favorite, is_online, tag_ids } = req.body;

  const nest = db.prepare('SELECT * FROM nests WHERE id = ?').get(id);
  if (!nest) return res.status(404).json({ error: 'Nest not found' });

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (species !== undefined) updates.species = species;
  if (location !== undefined) updates.location = location;
  if (notes !== undefined) updates.notes = notes;
  if (is_favorite !== undefined) updates.is_favorite = is_favorite ? 1 : 0;
  if (is_online !== undefined) updates.is_online = is_online ? 1 : 0;

  if (youtube_url !== undefined) {
    const video_id = extractVideoId(youtube_url);
    if (!video_id) return res.status(400).json({ error: 'Invalid YouTube URL' });
    updates.youtube_url = youtube_url;
    updates.video_id = video_id;
  }

  if (Object.keys(updates).length > 0) {
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), id];
    db.prepare(`UPDATE nests SET ${setClauses} WHERE id = ?`).run(...values);
  }

  // Update tags if provided
  if (tag_ids !== undefined) {
    db.prepare('DELETE FROM nest_tags WHERE nest_id = ?').run(id);
    const insertTag = db.prepare('INSERT OR IGNORE INTO nest_tags (nest_id, tag_id) VALUES (?, ?)');
    for (const tid of tag_ids) insertTag.run(id, tid);
  }

  const updated = db.prepare('SELECT * FROM nests WHERE id = ?').get(id);
  updated.tags = db.prepare(`
    SELECT t.id, t.name, t.color FROM nest_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.nest_id = ?
  `).all(id);

  res.json(updated);
});

// DELETE nest
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const nest = db.prepare('SELECT * FROM nests WHERE id = ?').get(id);
  if (!nest) return res.status(404).json({ error: 'Nest not found' });
  db.prepare('DELETE FROM nests WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
