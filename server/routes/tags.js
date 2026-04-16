const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all tags (with nest count)
router.get('/', (req, res) => {
  const tags = db.prepare(`
    SELECT t.*, COUNT(nt.nest_id) as nest_count
    FROM tags t
    LEFT JOIN nest_tags nt ON nt.tag_id = t.id
    GROUP BY t.id
    ORDER BY t.name
  `).all();
  res.json(tags);
});

// POST create tag
router.post('/', (req, res) => {
  const { name, color } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '标签名称不能为空' });
  }
  try {
    const result = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name.trim(), color || '#4a90d9');
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(tag);
  } catch (e) {
    res.status(400).json({ error: '标签名称已存在' });
  }
});

// DELETE tag
router.delete('/:id', (req, res) => {
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });
  db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
