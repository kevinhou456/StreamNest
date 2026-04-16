const express = require('express');
const router = express.Router();
const db = require('../db');

// GET order for a view
router.get('/:viewKey', (req, res) => {
  const rows = db.prepare(`
    SELECT nest_id FROM view_orders
    WHERE view_key = ?
    ORDER BY position ASC
  `).all(req.params.viewKey);
  res.json(rows.map(r => r.nest_id));
});

// PUT save order for a view
router.put('/:viewKey', (req, res) => {
  const { viewKey } = req.params;
  const { nest_ids } = req.body;

  if (!Array.isArray(nest_ids)) {
    return res.status(400).json({ error: 'nest_ids must be an array' });
  }

  const deleteStmt = db.prepare('DELETE FROM view_orders WHERE view_key = ?');
  const insertStmt = db.prepare('INSERT INTO view_orders (view_key, nest_id, position) VALUES (?, ?, ?)');

  db.transaction(() => {
    deleteStmt.run(viewKey);
    nest_ids.forEach((id, index) => insertStmt.run(viewKey, id, index));
  })();

  res.json({ success: true });
});

module.exports = router;
