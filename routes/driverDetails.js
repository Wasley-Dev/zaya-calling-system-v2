// routes/driverDetails.js
const express = require('express');
const router  = express.Router();
const { getDb } = require('../db/database');

router.get('/', (_req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT dd.*, cl.First_Name, cl.Last_Name, cl.Mobile_Phone,
             cl.Status, cl.Stage, cl.Booking, cl.Assigned_To
      FROM DriverDetails dd
      JOIN CallLogs cl ON cl.ID = dd.CallLogsID
      ORDER BY dd.Updated_At DESC
    `).all();
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/expiring', (_req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT dd.*, cl.First_Name, cl.Last_Name, cl.Mobile_Phone, cl.Status
      FROM DriverDetails dd
      JOIN CallLogs cl ON cl.ID = dd.CallLogsID
      WHERE dd.LicenseExpiryDate IS NOT NULL
        AND dd.LicenseExpiryDate <= date('now', '+60 days')
      ORDER BY dd.LicenseExpiryDate ASC
    `).all();
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/by-contact/:id', (req, res) => {
  try {
    const db = getDb();
    res.json({ success: true, data: db.prepare('SELECT * FROM DriverDetails WHERE CallLogsID=?').get(req.params.id) || null });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { CallLogsID, DriverName, LicenseNumber, LicenseClass, LicenseIssueDate, LicenseExpiryDate, DVLACheck, DBSCheck, PCOCheck, VehicleType, Notes } = req.body;
    const existing = db.prepare('SELECT DriverDetailID FROM DriverDetails WHERE CallLogsID=?').get(CallLogsID);
    if (existing) {
      db.prepare(`UPDATE DriverDetails SET DriverName=?,LicenseNumber=?,LicenseClass=?,LicenseIssueDate=?,LicenseExpiryDate=?,DVLACheck=?,DBSCheck=?,PCOCheck=?,VehicleType=?,Notes=?,Updated_At=CURRENT_TIMESTAMP WHERE CallLogsID=?`).run(DriverName,LicenseNumber,LicenseClass,LicenseIssueDate,LicenseExpiryDate,DVLACheck||'Pending',DBSCheck||'Pending',PCOCheck||'Pending',VehicleType||'',Notes||'',CallLogsID);
      return res.json({ success: true, data: db.prepare('SELECT * FROM DriverDetails WHERE CallLogsID=?').get(CallLogsID) });
    }
    const r = db.prepare(`INSERT INTO DriverDetails (CallLogsID,DriverName,LicenseNumber,LicenseClass,LicenseIssueDate,LicenseExpiryDate,DVLACheck,DBSCheck,PCOCheck,VehicleType,Notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(CallLogsID,DriverName,LicenseNumber,LicenseClass,LicenseIssueDate,LicenseExpiryDate,DVLACheck||'Pending',DBSCheck||'Pending',PCOCheck||'Pending',VehicleType||'',Notes||'');
    res.status(201).json({ success: true, data: db.prepare('SELECT * FROM DriverDetails WHERE DriverDetailID=?').get(r.lastInsertRowid) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { DriverName, LicenseNumber, LicenseClass, LicenseIssueDate, LicenseExpiryDate, DVLACheck, DBSCheck, PCOCheck, VehicleType, Notes } = req.body;
    db.prepare(`UPDATE DriverDetails SET DriverName=?,LicenseNumber=?,LicenseClass=?,LicenseIssueDate=?,LicenseExpiryDate=?,DVLACheck=?,DBSCheck=?,PCOCheck=?,VehicleType=?,Notes=?,Updated_At=CURRENT_TIMESTAMP WHERE DriverDetailID=?`).run(DriverName,LicenseNumber,LicenseClass,LicenseIssueDate,LicenseExpiryDate,DVLACheck,DBSCheck,PCOCheck,VehicleType,Notes||'',req.params.id);
    res.json({ success: true, data: db.prepare('SELECT * FROM DriverDetails WHERE DriverDetailID=?').get(req.params.id) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM DriverDetails WHERE DriverDetailID=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
