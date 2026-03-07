const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');

const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});

const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

function logActivity(db, callLogsId, action, detail, entity = 'contact', createdBy = 'System') {
  try {
    db.prepare('INSERT INTO ActivityLog (CallLogsID,Action,Detail,Entity,Created_By) VALUES (?,?,?,?,?)')
      .run(callLogsId, action, detail, entity, createdBy);
  } catch (_) {}
}

function parseAttachments(rawValue) {
  try {
    return JSON.parse(rawValue || '[]');
  } catch (_) {
    return [];
  }
}

function removeAttachmentFiles(attachments) {
  attachments.forEach(file => {
    if (!file?.path) return;
    const absolutePath = path.join(uploadsDir, file.path);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  });
}

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { search, status, stage, caller_type, booking, priority, assigned_to, overdue } = req.query;
    let sql = `
      SELECT cl.*,
             dd.DriverDetailID, dd.LicenseNumber, dd.LicenseClass,
             dd.LicenseIssueDate, dd.LicenseExpiryDate,
             dd.DVLACheck, dd.DBSCheck, dd.PCOCheck, dd.VehicleType,
             (SELECT COUNT(*) FROM CallSessions cs WHERE cs.CallLogsID = cl.ID) AS session_count
      FROM CallLogs cl
      LEFT JOIN DriverDetails dd ON dd.CallLogsID = cl.ID
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += ' AND (cl.First_Name LIKE ? OR cl.Last_Name LIKE ? OR cl.Mobile_Phone LIKE ? OR cl.E_mail_Address LIKE ? OR cl.Address LIKE ?)';
      const searchLike = `%${search}%`;
      params.push(searchLike, searchLike, searchLike, searchLike, searchLike);
    }
    if (status) {
      sql += ' AND cl.Status = ?';
      params.push(status);
    }
    if (stage) {
      sql += ' AND cl.Stage = ?';
      params.push(stage);
    }
    if (caller_type) {
      sql += ' AND cl.Caller_Type = ?';
      params.push(caller_type);
    }
    if (booking) {
      sql += ' AND cl.Booking = ?';
      params.push(booking);
    }
    if (priority) {
      sql += ' AND cl.Priority = ?';
      params.push(priority);
    }
    if (assigned_to) {
      sql += ' AND cl.Assigned_To = ?';
      params.push(assigned_to);
    }
    if (overdue === 'true') {
      sql += ` AND cl.Next_Call_Date IS NOT NULL AND cl.Next_Call_Date < date('now')`;
    }

    sql += ' ORDER BY cl.Updated_At DESC';

    res.json({ success: true, data: db.prepare(sql).all(...params) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const contact = db.prepare(`
      SELECT cl.*, dd.DriverDetailID, dd.DriverName, dd.LicenseNumber, dd.LicenseClass,
             dd.LicenseIssueDate, dd.LicenseExpiryDate, dd.DVLACheck, dd.DBSCheck,
             dd.PCOCheck, dd.VehicleType, dd.Notes AS DriverNotes
      FROM CallLogs cl
      LEFT JOIN DriverDetails dd ON dd.CallLogsID = cl.ID
      WHERE cl.ID = ?
    `).get(req.params.id);

    if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });

    const sessions = db.prepare(
      'SELECT * FROM CallSessions WHERE CallLogsID = ? ORDER BY Called_At DESC'
    ).all(req.params.id);
    const activity = db.prepare(
      'SELECT * FROM ActivityLog WHERE CallLogsID = ? ORDER BY Created_At DESC LIMIT 30'
    ).all(req.params.id);
    const attachments = parseAttachments(contact.Attachments);

    res.json({ success: true, data: { ...contact, sessions, activity, attachments } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const {
      First_Name, Last_Name, Job_Title, Mobile_Phone, E_mail_Address,
      Address, Country_Region, Caller_Type, Status, Stage, Booking,
      Documentations, Remarks, Notes, Priority, Assigned_To,
      Next_Call_Date
    } = req.body;

    const result = db.prepare(`
      INSERT INTO CallLogs
        (First_Name,Last_Name,Job_Title,Mobile_Phone,E_mail_Address,Address,
         Country_Region,Caller_Type,Status,Stage,Booking,Documentations,
         Remarks,Notes,Priority,Assigned_To,Next_Call_Date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      First_Name || '', Last_Name || '', Job_Title || '', Mobile_Phone || '',
      E_mail_Address || '', Address || '', Country_Region || 'United Kingdom',
      Caller_Type || 'DRIVER', Status || 'Pending', Stage || '1 - New Caller',
      Booking || '', Documentations || '', Remarks || '', Notes || '',
      Priority || 'Normal', Assigned_To || '', Next_Call_Date || null
    );

    if (Remarks) {
      db.prepare('INSERT INTO CallSessions (CallLogsID,Outcome,Notes,Called_By) VALUES (?,?,?,?)')
        .run(result.lastInsertRowid, 'Note Added', Remarks, Assigned_To || 'System');
    }

    logActivity(db, result.lastInsertRowid, 'Contact Created', `${First_Name} ${Last_Name} added as ${Caller_Type}`, 'contact', Assigned_To || 'System');

    res.status(201).json({
      success: true,
      data: db.prepare('SELECT * FROM CallLogs WHERE ID = ?').get(result.lastInsertRowid),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const old = db.prepare('SELECT * FROM CallLogs WHERE ID = ?').get(req.params.id);
    if (!old) return res.status(404).json({ success: false, error: 'Not found' });

    const {
      First_Name, Last_Name, Job_Title, Mobile_Phone, E_mail_Address,
      Address, Country_Region, Caller_Type, Status, Stage, Booking,
      Documentations, Remarks, Notes, Priority, Assigned_To,
      Last_Call_Date, Next_Call_Date
    } = req.body;

    db.prepare(`
      UPDATE CallLogs SET
        First_Name=?,Last_Name=?,Job_Title=?,Mobile_Phone=?,E_mail_Address=?,
        Address=?,Country_Region=?,Caller_Type=?,Status=?,Stage=?,Booking=?,
        Documentations=?,Remarks=?,Notes=?,Priority=?,Assigned_To=?,
        Last_Call_Date=?,Next_Call_Date=?,Updated_At=CURRENT_TIMESTAMP
      WHERE ID=?
    `).run(
      First_Name, Last_Name, Job_Title, Mobile_Phone, E_mail_Address,
      Address, Country_Region, Caller_Type, Status, Stage, Booking,
      Documentations, Remarks, Notes, Priority, Assigned_To,
      Last_Call_Date || null, Next_Call_Date || null, req.params.id
    );

    const actor = Assigned_To || 'System';
    if (old.Status !== Status) logActivity(db, req.params.id, 'Status Changed', `${old.Status} -> ${Status}`, 'contact', actor);
    if (old.Stage !== Stage) logActivity(db, req.params.id, 'Stage Changed', `${old.Stage} -> ${Stage}`, 'contact', actor);
    if (old.Booking !== Booking && Booking) logActivity(db, req.params.id, 'Booking Updated', `Booking: ${Booking}`, 'contact', actor);

    res.json({ success: true, data: db.prepare('SELECT * FROM CallLogs WHERE ID = ?').get(req.params.id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/:id/quick', (req, res) => {
  try {
    const db = getDb();
    const allowed = ['Status', 'Stage', 'Booking', 'Priority', 'Assigned_To', 'Next_Call_Date'];
    const updates = Object.entries(req.body).filter(([key]) => allowed.includes(key));
    if (!updates.length) return res.status(400).json({ success: false, error: 'No valid fields' });

    const old = db.prepare('SELECT * FROM CallLogs WHERE ID = ?').get(req.params.id);
    if (!old) return res.status(404).json({ success: false, error: 'Contact not found' });

    const setClauses = updates.map(([key]) => `${key}=?`).join(',');
    db.prepare(`UPDATE CallLogs SET ${setClauses},Updated_At=CURRENT_TIMESTAMP WHERE ID=?`)
      .run(...updates.map(([, value]) => value), req.params.id);

    updates.forEach(([key, value]) => {
      if (old[key] !== value) logActivity(db, req.params.id, `${key} Changed`, `${old[key]} -> ${value}`, 'contact', 'User');
    });

    res.json({ success: true, data: db.prepare('SELECT * FROM CallLogs WHERE ID = ?').get(req.params.id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const contact = db.prepare('SELECT Attachments FROM CallLogs WHERE ID=?').get(req.params.id);
    if (!contact) return res.status(404).json({ success: false, error: 'Not found' });

    removeAttachmentFiles(parseAttachments(contact.Attachments));
    db.prepare('DELETE FROM CallLogs WHERE ID=?').run(req.params.id);
    res.json({ success: true, message: 'Contact deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/calls', (req, res) => {
  try {
    const db = getDb();
    const contact = db.prepare('SELECT ID FROM CallLogs WHERE ID = ?').get(req.params.id);
    if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });

    const { Outcome, Duration_Min, Notes, Called_By, Next_Action, Next_Call_Date } = req.body;

    const result = db.prepare(`
      INSERT INTO CallSessions (CallLogsID,Outcome,Duration_Min,Notes,Called_By,Next_Action)
      VALUES (?,?,?,?,?,?)
    `).run(req.params.id, Outcome || 'No Answer', Duration_Min || 0, Notes || '', Called_By || '', Next_Action || '');

    db.prepare(`
      UPDATE CallLogs SET Call_Count=Call_Count+1, Last_Call_Date=date('now'),
        Next_Call_Date=?, Updated_At=CURRENT_TIMESTAMP WHERE ID=?
    `).run(Next_Call_Date || null, req.params.id);

    logActivity(db, req.params.id, 'Call Logged', `${Outcome} - ${Notes || 'No notes'}`, 'call', Called_By || 'System');

    res.status(201).json({ success: true, data: db.prepare('SELECT * FROM CallSessions WHERE SessionID=?').get(result.lastInsertRowid) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id/calls/:sessionId', (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM CallSessions WHERE SessionID=? AND CallLogsID=?')
      .run(req.params.sessionId, req.params.id);

    if (!result.changes) {
      return res.status(404).json({ success: false, error: 'Call session not found' });
    }

    db.prepare(`
      UPDATE CallLogs
      SET Call_Count = (
        SELECT COUNT(*) FROM CallSessions WHERE CallLogsID = ?
      ),
      Updated_At = CURRENT_TIMESTAMP
      WHERE ID = ?
    `).run(req.params.id, req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/attachments', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file' });

    const db = getDb();
    const contact = db.prepare('SELECT Attachments FROM CallLogs WHERE ID=?').get(req.params.id);
    if (!contact) return res.status(404).json({ success: false, error: 'Not found' });

    const list = parseAttachments(contact.Attachments);
    const entry = {
      id: uuidv4(),
      filename: req.file.originalname,
      path: req.file.filename,
      size: req.file.size,
      uploaded: new Date().toISOString(),
    };

    list.push(entry);

    db.prepare('UPDATE CallLogs SET Attachments=?,Updated_At=CURRENT_TIMESTAMP WHERE ID=?')
      .run(JSON.stringify(list), req.params.id);

    logActivity(db, req.params.id, 'File Attached', req.file.originalname, 'file', 'User');
    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id/attachments/:attId', (req, res) => {
  try {
    const db = getDb();
    const contact = db.prepare('SELECT Attachments FROM CallLogs WHERE ID=?').get(req.params.id);
    if (!contact) return res.status(404).json({ success: false, error: 'Not found' });

    const list = parseAttachments(contact.Attachments);
    const removed = list.find(file => file.id === req.params.attId);
    const filtered = list.filter(file => file.id !== req.params.attId);

    db.prepare('UPDATE CallLogs SET Attachments=?,Updated_At=CURRENT_TIMESTAMP WHERE ID=?')
      .run(JSON.stringify(filtered), req.params.id);

    if (removed?.path) {
      const absolutePath = path.join(uploadsDir, removed.path);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
      logActivity(db, req.params.id, 'File Removed', removed.filename, 'file', 'User');
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
