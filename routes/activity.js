const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 40;
    const rows = db.prepare(`
      SELECT al.*, cl.First_Name, cl.Last_Name
      FROM ActivityLog al
      LEFT JOIN CallLogs cl ON cl.ID = al.CallLogsID
      ORDER BY al.Created_At DESC
      LIMIT ?
    `).all(limit);

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
