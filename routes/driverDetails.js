// routes/driverDetails.js
const express = require('express');
const router  = express.Router();
const { getDb } = require('../db/database');
const pg = require('../db/pg');

router.get('/', async (_req, res) => {
  try {
    if (pg.isPgEnabled()) {
      await pg.ensureSchema();
      const result = await pg.pgQuery(`
        SELECT dd.*, cl."First_Name", cl."Last_Name", cl."Mobile_Phone",
               cl."Status", cl."Stage", cl."Booking", cl."Assigned_To"
        FROM "DriverDetails" dd
        JOIN "CallLogs" cl ON cl."ID" = dd."CallLogsID"
        ORDER BY dd."Updated_At" DESC
      `);
      return res.json({ success: true, data: result.rows });
    }

    const db = getDb();
    const rows = db.prepare(`
      SELECT dd.*, cl.First_Name, cl.Last_Name, cl.Mobile_Phone,
             cl.Status, cl.Stage, cl.Booking, cl.Assigned_To
      FROM DriverDetails dd
      JOIN CallLogs cl ON cl.ID = dd.CallLogsID
      ORDER BY dd.Updated_At DESC
    `).all();
    return res.json({ success: true, data: rows });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get('/expiring', async (_req, res) => {
  try {
    if (pg.isPgEnabled()) {
      await pg.ensureSchema();
      const result = await pg.pgQuery(`
        SELECT dd.*, cl."First_Name", cl."Last_Name", cl."Mobile_Phone", cl."Status"
        FROM "DriverDetails" dd
        JOIN "CallLogs" cl ON cl."ID" = dd."CallLogsID"
        WHERE dd."LicenseExpiryDate" IS NOT NULL
          AND dd."LicenseExpiryDate" <= (CURRENT_DATE + INTERVAL '60 days')
        ORDER BY dd."LicenseExpiryDate" ASC
      `);
      return res.json({ success: true, data: result.rows });
    }

    const db = getDb();
    const rows = db.prepare(`
      SELECT dd.*, cl.First_Name, cl.Last_Name, cl.Mobile_Phone, cl.Status
      FROM DriverDetails dd
      JOIN CallLogs cl ON cl.ID = dd.CallLogsID
      WHERE dd.LicenseExpiryDate IS NOT NULL
        AND dd.LicenseExpiryDate <= date('now', '+60 days')
      ORDER BY dd.LicenseExpiryDate ASC
    `).all();
    return res.json({ success: true, data: rows });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get('/by-contact/:id', async (req, res) => {
  try {
    if (pg.isPgEnabled()) {
      await pg.ensureSchema();
      const result = await pg.pgQuery(`SELECT * FROM "DriverDetails" WHERE "CallLogsID"=$1`, [Number(req.params.id)]);
      return res.json({ success: true, data: result.rows[0] || null });
    }
    const db = getDb();
    return res.json({ success: true, data: db.prepare('SELECT * FROM DriverDetails WHERE CallLogsID=?').get(req.params.id) || null });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { CallLogsID, DriverName, LicenseNumber, LicenseClass, LicenseIssueDate, LicenseExpiryDate, DVLACheck, DBSCheck, PCOCheck, VehicleType, Notes } = req.body;
    const callLogsId = Number(CallLogsID);
    if (pg.isPgEnabled()) {
      await pg.ensureSchema();
      const existing = await pg.pgQuery(`SELECT "DriverDetailID" FROM "DriverDetails" WHERE "CallLogsID"=$1`, [callLogsId]);
      if (existing.rows[0]) {
        await pg.pgQuery(
          `
          UPDATE "DriverDetails"
          SET "DriverName"=$1,"LicenseNumber"=$2,"LicenseClass"=$3,"LicenseIssueDate"=$4,"LicenseExpiryDate"=$5,
              "DVLACheck"=$6,"DBSCheck"=$7,"PCOCheck"=$8,"VehicleType"=$9,"Notes"=$10,"Updated_At"=now()
          WHERE "CallLogsID"=$11
          `,
          [
            DriverName || '',
            LicenseNumber || '',
            LicenseClass || '',
            LicenseIssueDate || null,
            LicenseExpiryDate || null,
            DVLACheck || 'Pending',
            DBSCheck || 'Pending',
            PCOCheck || 'Pending',
            VehicleType || '',
            Notes || '',
            callLogsId,
          ]
        );
        const row = await pg.pgQuery(`SELECT * FROM "DriverDetails" WHERE "CallLogsID"=$1`, [callLogsId]);
        return res.json({ success: true, data: row.rows[0] || null });
      }
      const inserted = await pg.pgQuery(
        `
        INSERT INTO "DriverDetails" ("CallLogsID","DriverName","LicenseNumber","LicenseClass","LicenseIssueDate","LicenseExpiryDate","DVLACheck","DBSCheck","PCOCheck","VehicleType","Notes","Created_At","Updated_At")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now())
        RETURNING "DriverDetailID"
        `,
        [
          callLogsId,
          DriverName || '',
          LicenseNumber || '',
          LicenseClass || '',
          LicenseIssueDate || null,
          LicenseExpiryDate || null,
          DVLACheck || 'Pending',
          DBSCheck || 'Pending',
          PCOCheck || 'Pending',
          VehicleType || '',
          Notes || '',
        ]
      );
      const row = await pg.pgQuery(`SELECT * FROM "DriverDetails" WHERE "DriverDetailID"=$1`, [Number(inserted.rows[0].DriverDetailID)]);
      return res.status(201).json({ success: true, data: row.rows[0] || null });
    }

    const db = getDb();
    const existing = db.prepare('SELECT DriverDetailID FROM DriverDetails WHERE CallLogsID=?').get(CallLogsID);
    if (existing) {
      db.prepare(`UPDATE DriverDetails SET DriverName=?,LicenseNumber=?,LicenseClass=?,LicenseIssueDate=?,LicenseExpiryDate=?,DVLACheck=?,DBSCheck=?,PCOCheck=?,VehicleType=?,Notes=?,Updated_At=CURRENT_TIMESTAMP WHERE CallLogsID=?`).run(DriverName,LicenseNumber,LicenseClass,LicenseIssueDate,LicenseExpiryDate,DVLACheck||'Pending',DBSCheck||'Pending',PCOCheck||'Pending',VehicleType||'',Notes||'',CallLogsID);
      return res.json({ success: true, data: db.prepare('SELECT * FROM DriverDetails WHERE CallLogsID=?').get(CallLogsID) });
    }
    const r = db.prepare(`INSERT INTO DriverDetails (CallLogsID,DriverName,LicenseNumber,LicenseClass,LicenseIssueDate,LicenseExpiryDate,DVLACheck,DBSCheck,PCOCheck,VehicleType,Notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(CallLogsID,DriverName,LicenseNumber,LicenseClass,LicenseIssueDate,LicenseExpiryDate,DVLACheck||'Pending',DBSCheck||'Pending',PCOCheck||'Pending',VehicleType||'',Notes||'');
    return res.status(201).json({ success: true, data: db.prepare('SELECT * FROM DriverDetails WHERE DriverDetailID=?').get(r.lastInsertRowid) });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { DriverName, LicenseNumber, LicenseClass, LicenseIssueDate, LicenseExpiryDate, DVLACheck, DBSCheck, PCOCheck, VehicleType, Notes } = req.body;
    const driverId = Number(req.params.id);
    if (pg.isPgEnabled()) {
      await pg.ensureSchema();
      await pg.pgQuery(
        `
        UPDATE "DriverDetails"
        SET "DriverName"=$1,"LicenseNumber"=$2,"LicenseClass"=$3,"LicenseIssueDate"=$4,"LicenseExpiryDate"=$5,
            "DVLACheck"=$6,"DBSCheck"=$7,"PCOCheck"=$8,"VehicleType"=$9,"Notes"=$10,"Updated_At"=now()
        WHERE "DriverDetailID"=$11
        `,
        [DriverName || '', LicenseNumber || '', LicenseClass || '', LicenseIssueDate || null, LicenseExpiryDate || null, DVLACheck || 'Pending', DBSCheck || 'Pending', PCOCheck || 'Pending', VehicleType || '', Notes || '', driverId]
      );
      const row = await pg.pgQuery(`SELECT * FROM "DriverDetails" WHERE "DriverDetailID"=$1`, [driverId]);
      return res.json({ success: true, data: row.rows[0] || null });
    }
    const db = getDb();
    db.prepare(`UPDATE DriverDetails SET DriverName=?,LicenseNumber=?,LicenseClass=?,LicenseIssueDate=?,LicenseExpiryDate=?,DVLACheck=?,DBSCheck=?,PCOCheck=?,VehicleType=?,Notes=?,Updated_At=CURRENT_TIMESTAMP WHERE DriverDetailID=?`).run(DriverName,LicenseNumber,LicenseClass,LicenseIssueDate,LicenseExpiryDate,DVLACheck,DBSCheck,PCOCheck,VehicleType,Notes||'',req.params.id);
    return res.json({ success: true, data: db.prepare('SELECT * FROM DriverDetails WHERE DriverDetailID=?').get(req.params.id) });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (pg.isPgEnabled()) {
      await pg.ensureSchema();
      await pg.pgQuery(`DELETE FROM "DriverDetails" WHERE "DriverDetailID"=$1`, [Number(req.params.id)]);
      return res.json({ success: true });
    }
    const db = getDb();
    db.prepare('DELETE FROM DriverDetails WHERE DriverDetailID=?').run(req.params.id);
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
