const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

router.get('/', (_req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT cl.ID, cl.First_Name, cl.Last_Name, cl.Job_Title, cl.Mobile_Phone,
             cl.E_mail_Address, cl.Address, cl.Country_Region, cl.Caller_Type,
             cl.Status, cl.Stage, cl.Booking, cl.Documentations, cl.Notes,
             cl.Priority, cl.Assigned_To, cl.Call_Count, cl.Last_Call_Date,
             cl.Next_Call_Date, cl.Created_At, cl.Updated_At,
             dd.LicenseNumber, dd.LicenseClass, dd.LicenseExpiryDate,
             dd.DVLACheck, dd.DBSCheck, dd.PCOCheck
      FROM CallLogs cl
      LEFT JOIN DriverDetails dd ON dd.CallLogsID = cl.ID
      ORDER BY cl.Updated_At DESC
    `).all();

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
