const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const pg = require('../db/pg');

router.get('/', (req, res) => {
  const parsedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 40;

  if (pg.isPgEnabled()) {
    (async () => {
      try {
        await pg.ensureSchema();
        const result = await pg.pgQuery(
          `
          SELECT al.*, cl."First_Name", cl."Last_Name"
          FROM "ActivityLog" al
          LEFT JOIN "CallLogs" cl ON cl."ID" = al."CallLogsID"
          ORDER BY al."Created_At" DESC
          LIMIT $1
          `,
          [limit]
        );
        res.json({ success: true, data: result.rows });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    })();
    return;
  }

  try {
    const db = getDb();
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
