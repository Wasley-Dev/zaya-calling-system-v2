const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { getDb } = require('../db/database');
const pg = require('../db/pg');

let blobPut = null;
let blobDel = null;
try {
  // Optional: only used in Postgres mode (Vercel).
  // eslint-disable-next-line global-require
  ({ put: blobPut, del: blobDel } = require('@vercel/blob'));
} catch (_) {
  blobPut = null;
  blobDel = null;
}

const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
if (!pg.isPgEnabled()) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (_) {}
}

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});

const diskUpload = multer({ storage: diskStorage, limits: { fileSize: 15 * 1024 * 1024 } });
const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const upload = pg.isPgEnabled() ? memoryUpload : diskUpload;

function logActivitySqlite(db, callLogsId, action, detail, entity = 'contact', createdBy = 'System') {
  try {
    db.prepare('INSERT INTO ActivityLog (CallLogsID,Action,Detail,Entity,Created_By) VALUES (?,?,?,?,?)')
      .run(callLogsId, action, detail, entity, createdBy);
  } catch (_) {}
}

async function logActivityPg(callLogsId, action, detail, entity = 'contact', createdBy = 'System') {
  try {
    await pg.ensureSchema();
    await pg.pgQuery(
      `
      INSERT INTO "ActivityLog" ("CallLogsID","Action","Detail","Entity","Created_By","Created_At")
      VALUES ($1,$2,$3,$4,$5,now())
      `,
      [callLogsId ? Number(callLogsId) : null, String(action || '').trim(), String(detail || ''), String(entity || 'contact'), String(createdBy || 'System')]
    );
  } catch (_) {}
}

function parseAttachmentsSqlite(rawValue) {
  try {
    return JSON.parse(rawValue || '[]');
  } catch (_) {
    return [];
  }
}

function normalizeAttachmentsPg(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function removeAttachmentFilesSqlite(attachments) {
  attachments.forEach(file => {
    if (!file?.path) return;
    const absolutePath = path.join(uploadsDir, file.path);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  });
}

async function removeAttachmentBlobsPg(attachments) {
  if (!blobDel) return;
  const urls = attachments
    .map(item => item?.url || item?.blobUrl || item?.href)
    .filter(Boolean);
  await Promise.allSettled(urls.map(url => blobDel(url)));
}

router.get('/', (req, res) => {
  const { search, status, stage, caller_type, booking, priority, assigned_to, overdue } = req.query;

  if (pg.isPgEnabled()) {
    (async () => {
      try {
        await pg.ensureSchema();
        const where = [];
        const params = [];
        const add = value => {
          params.push(value);
          return `$${params.length}`;
        };

        if (search) {
          const like = `%${search}%`;
          const p = add(like);
          where.push(`(
            cl."First_Name" ILIKE ${p}
            OR cl."Last_Name" ILIKE ${p}
            OR cl."Job_Title" ILIKE ${p}
            OR cl."Mobile_Phone" ILIKE ${p}
            OR cl."E_mail_Address" ILIKE ${p}
            OR cl."Address" ILIKE ${p}
            OR cl."Caller_Type" ILIKE ${p}
          )`);
        }
        if (status) where.push(`cl."Status" = ${add(status)}`);
        if (stage) where.push(`cl."Stage" = ${add(stage)}`);
        if (caller_type) where.push(`cl."Caller_Type" = ${add(caller_type)}`);
        if (booking) where.push(`cl."Booking" = ${add(booking)}`);
        if (priority) where.push(`cl."Priority" = ${add(priority)}`);
        if (assigned_to) where.push(`cl."Assigned_To" = ${add(assigned_to)}`);
        if (overdue === 'true') where.push(`cl."Next_Call_Date" IS NOT NULL AND cl."Next_Call_Date" < CURRENT_DATE`);

        const sql = `
          SELECT cl.*,
                 dd."DriverDetailID" AS "DriverDetailID",
                 dd."LicenseNumber" AS "LicenseNumber",
                 dd."LicenseClass" AS "LicenseClass",
                 dd."LicenseIssueDate" AS "LicenseIssueDate",
                 dd."LicenseExpiryDate" AS "LicenseExpiryDate",
                 dd."DVLACheck" AS "DVLACheck",
                 dd."DBSCheck" AS "DBSCheck",
                 dd."PCOCheck" AS "PCOCheck",
                 dd."VehicleType" AS "VehicleType",
                 (SELECT COUNT(*)::int FROM "CallSessions" cs WHERE cs."CallLogsID" = cl."ID") AS session_count
          FROM "CallLogs" cl
          LEFT JOIN "DriverDetails" dd ON dd."CallLogsID" = cl."ID"
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY cl."Updated_At" DESC
        `;

        const result = await pg.pgQuery(sql, params);
        res.json({ success: true, data: result.rows });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    })();
    return;
  }

  try {
    const db = getDb();
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
      sql += ` AND (
        cl.First_Name LIKE ?
        OR cl.Last_Name LIKE ?
        OR cl.Job_Title LIKE ?
        OR cl.Mobile_Phone LIKE ?
        OR cl.E_mail_Address LIKE ?
        OR cl.Address LIKE ?
        OR cl.Caller_Type LIKE ?
      )`;
      const searchLike = `%${search}%`;
      params.push(searchLike, searchLike, searchLike, searchLike, searchLike, searchLike, searchLike);
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
  const id = req.params.id;

  if (pg.isPgEnabled()) {
    (async () => {
      try {
        await pg.ensureSchema();
        const contactResult = await pg.pgQuery(
          `
          SELECT cl.*,
                 dd."DriverDetailID" AS "DriverDetailID",
                 dd."DriverName" AS "DriverName",
                 dd."LicenseNumber" AS "LicenseNumber",
                 dd."LicenseClass" AS "LicenseClass",
                 dd."LicenseIssueDate" AS "LicenseIssueDate",
                 dd."LicenseExpiryDate" AS "LicenseExpiryDate",
                 dd."DVLACheck" AS "DVLACheck",
                 dd."DBSCheck" AS "DBSCheck",
                 dd."PCOCheck" AS "PCOCheck",
                 dd."VehicleType" AS "VehicleType",
                 dd."Notes" AS "DriverNotes"
          FROM "CallLogs" cl
          LEFT JOIN "DriverDetails" dd ON dd."CallLogsID" = cl."ID"
          WHERE cl."ID" = $1
          `,
          [Number(id)]
        );
        const contact = contactResult.rows[0];
        if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });

        const sessionsResult = await pg.pgQuery(
          `SELECT * FROM "CallSessions" WHERE "CallLogsID" = $1 ORDER BY "Called_At" DESC`,
          [Number(id)]
        );
        const activityResult = await pg.pgQuery(
          `SELECT * FROM "ActivityLog" WHERE "CallLogsID" = $1 ORDER BY "Created_At" DESC LIMIT 30`,
          [Number(id)]
        );

        const attachments = normalizeAttachmentsPg(contact.Attachments);
        res.json({ success: true, data: { ...contact, sessions: sessionsResult.rows, activity: activityResult.rows, attachments } });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    })();
    return;
  }

  try {
    const db = getDb();
    const contact = db.prepare(`
      SELECT cl.*, dd.DriverDetailID, dd.DriverName, dd.LicenseNumber, dd.LicenseClass,
             dd.LicenseIssueDate, dd.LicenseExpiryDate, dd.DVLACheck, dd.DBSCheck,
             dd.PCOCheck, dd.VehicleType, dd.Notes AS DriverNotes
      FROM CallLogs cl
      LEFT JOIN DriverDetails dd ON dd.CallLogsID = cl.ID
      WHERE cl.ID = ?
    `).get(id);

    if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });

    const sessions = db.prepare(
      'SELECT * FROM CallSessions WHERE CallLogsID = ? ORDER BY Called_At DESC'
    ).all(id);
    const activity = db.prepare(
      'SELECT * FROM ActivityLog WHERE CallLogsID = ? ORDER BY Created_At DESC LIMIT 30'
    ).all(id);
    const attachments = parseAttachmentsSqlite(contact.Attachments);

    res.json({ success: true, data: { ...contact, sessions, activity, attachments } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', (req, res) => {
  if (pg.isPgEnabled()) {
    (async () => {
      try {
        await pg.ensureSchema();
        const body = req.body || {};
        const {
          First_Name, Last_Name, Job_Title, Mobile_Phone, E_mail_Address,
          Address, Country_Region, Caller_Type, Status, Stage, Booking,
          Documentations, Remarks, Notes, Priority, Assigned_To,
          Next_Call_Date,
          Avatar_URL,
        } = body;

        const result = await pg.pgQuery(
          `
          INSERT INTO "CallLogs"
            ("First_Name","Last_Name","Job_Title","Mobile_Phone","E_mail_Address","Address",
             "Country_Region","Caller_Type","Status","Stage","Booking","Documentations",
             "Remarks","Notes","Avatar_URL","Priority","Assigned_To","Next_Call_Date","Updated_At")
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())
          RETURNING *
          `,
          [
            First_Name || '',
            Last_Name || '',
            Job_Title || '',
            Mobile_Phone || '',
            E_mail_Address || '',
            Address || '',
            Country_Region || 'United Kingdom',
            Caller_Type || 'DRIVER',
            Status || 'Pending',
            Stage || '1 - New Caller',
            Booking || '',
            Documentations || '',
            Remarks || '',
            Notes || '',
            String(Avatar_URL || '').trim(),
            Priority || 'Normal',
            Assigned_To || '',
            Next_Call_Date || null,
          ]
        );

        const inserted = result.rows[0];
        if (Remarks) {
          await pg.pgQuery(
            `INSERT INTO "CallSessions" ("CallLogsID","Outcome","Notes","Called_By") VALUES ($1,$2,$3,$4)`,
            [Number(inserted.ID), 'Note Added', Remarks, Assigned_To || 'System']
          );
        }

        await logActivityPg(inserted.ID, 'Contact Created', `${First_Name || ''} ${Last_Name || ''} added as ${Caller_Type || 'DRIVER'}`, 'contact', Assigned_To || 'System');

        res.status(201).json({ success: true, data: inserted });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    })();
    return;
  }

  try {
    const db = getDb();
    const {
      First_Name, Last_Name, Job_Title, Mobile_Phone, E_mail_Address,
      Address, Country_Region, Caller_Type, Status, Stage, Booking,
      Documentations, Remarks, Notes, Priority, Assigned_To,
      Avatar_URL,
      Next_Call_Date
    } = req.body;

    const result = db.prepare(`
      INSERT INTO CallLogs
        (First_Name,Last_Name,Job_Title,Mobile_Phone,E_mail_Address,Address,
         Country_Region,Caller_Type,Status,Stage,Booking,Documentations,
         Remarks,Notes,Avatar_URL,Priority,Assigned_To,Next_Call_Date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      First_Name || '', Last_Name || '', Job_Title || '', Mobile_Phone || '',
      E_mail_Address || '', Address || '', Country_Region || 'United Kingdom',
      Caller_Type || 'DRIVER', Status || 'Pending', Stage || '1 - New Caller',
      Booking || '', Documentations || '', Remarks || '', Notes || '',
      String(Avatar_URL || '').trim(),
      Priority || 'Normal', Assigned_To || '', Next_Call_Date || null
    );

    if (Remarks) {
      db.prepare('INSERT INTO CallSessions (CallLogsID,Outcome,Notes,Called_By) VALUES (?,?,?,?)')
        .run(result.lastInsertRowid, 'Note Added', Remarks, Assigned_To || 'System');
    }

    logActivitySqlite(db, result.lastInsertRowid, 'Contact Created', `${First_Name} ${Last_Name} added as ${Caller_Type}`, 'contact', Assigned_To || 'System');

    res.status(201).json({
      success: true,
      data: db.prepare('SELECT * FROM CallLogs WHERE ID = ?').get(result.lastInsertRowid),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const id = req.params.id;

  if (pg.isPgEnabled()) {
    (async () => {
      try {
        await pg.ensureSchema();
        const oldResult = await pg.pgQuery(`SELECT * FROM "CallLogs" WHERE "ID" = $1`, [Number(id)]);
        const old = oldResult.rows[0];
        if (!old) return res.status(404).json({ success: false, error: 'Not found' });

        const body = req.body || {};
        const {
          First_Name, Last_Name, Job_Title, Mobile_Phone, E_mail_Address,
          Address, Country_Region, Caller_Type, Status, Stage, Booking,
          Documentations, Remarks, Notes, Priority, Assigned_To,
          Avatar_URL,
          Last_Call_Date, Next_Call_Date,
        } = body;

        await pg.pgQuery(
          `
          UPDATE "CallLogs" SET
            "First_Name"=$1,"Last_Name"=$2,"Job_Title"=$3,"Mobile_Phone"=$4,"E_mail_Address"=$5,
            "Address"=$6,"Country_Region"=$7,"Caller_Type"=$8,"Status"=$9,"Stage"=$10,"Booking"=$11,
            "Documentations"=$12,"Remarks"=$13,"Notes"=$14,"Avatar_URL"=$15,"Priority"=$16,"Assigned_To"=$17,
            "Last_Call_Date"=$18,"Next_Call_Date"=$19,"Updated_At"=now()
          WHERE "ID"=$20
          `,
          [
            First_Name,
            Last_Name,
            Job_Title,
            Mobile_Phone,
            E_mail_Address,
            Address,
            Country_Region,
            Caller_Type,
            Status,
            Stage,
            Booking,
            Documentations,
            Remarks,
            Notes,
            String(Avatar_URL || '').trim(),
            Priority,
            Assigned_To,
            Last_Call_Date || null,
            Next_Call_Date || null,
            Number(id),
          ]
        );

        const actor = Assigned_To || 'System';
        if (old.Status !== Status) await logActivityPg(id, 'Status Changed', `${old.Status} -> ${Status}`, 'contact', actor);
        if (old.Stage !== Stage) await logActivityPg(id, 'Stage Changed', `${old.Stage} -> ${Stage}`, 'contact', actor);
        if (old.Booking !== Booking && Booking) await logActivityPg(id, 'Booking Updated', `Booking: ${Booking}`, 'contact', actor);

        const updated = await pg.pgQuery(`SELECT * FROM "CallLogs" WHERE "ID"=$1`, [Number(id)]);
        res.json({ success: true, data: updated.rows[0] });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    })();
    return;
  }

  try {
    const db = getDb();
    const old = db.prepare('SELECT * FROM CallLogs WHERE ID = ?').get(id);
    if (!old) return res.status(404).json({ success: false, error: 'Not found' });

    const {
      First_Name, Last_Name, Job_Title, Mobile_Phone, E_mail_Address,
      Address, Country_Region, Caller_Type, Status, Stage, Booking,
      Documentations, Remarks, Notes, Priority, Assigned_To,
      Avatar_URL,
      Last_Call_Date, Next_Call_Date
    } = req.body;

    db.prepare(`
      UPDATE CallLogs SET
        First_Name=?,Last_Name=?,Job_Title=?,Mobile_Phone=?,E_mail_Address=?,
        Address=?,Country_Region=?,Caller_Type=?,Status=?,Stage=?,Booking=?,
        Documentations=?,Remarks=?,Notes=?,Avatar_URL=?,Priority=?,Assigned_To=?,
        Last_Call_Date=?,Next_Call_Date=?,Updated_At=CURRENT_TIMESTAMP
      WHERE ID=?
    `).run(
      First_Name, Last_Name, Job_Title, Mobile_Phone, E_mail_Address,
      Address, Country_Region, Caller_Type, Status, Stage, Booking,
      Documentations, Remarks, Notes, String(Avatar_URL || '').trim(), Priority, Assigned_To,
      Last_Call_Date || null, Next_Call_Date || null, id
    );

    const actor = Assigned_To || 'System';
    if (old.Status !== Status) logActivitySqlite(db, id, 'Status Changed', `${old.Status} -> ${Status}`, 'contact', actor);
    if (old.Stage !== Stage) logActivitySqlite(db, id, 'Stage Changed', `${old.Stage} -> ${Stage}`, 'contact', actor);
    if (old.Booking !== Booking && Booking) logActivitySqlite(db, id, 'Booking Updated', `Booking: ${Booking}`, 'contact', actor);

    res.json({ success: true, data: db.prepare('SELECT * FROM CallLogs WHERE ID = ?').get(id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/:id/quick', (req, res) => {
  const id = req.params.id;
  const allowed = ['Status', 'Stage', 'Booking', 'Priority', 'Assigned_To', 'Next_Call_Date'];
  const updates = Object.entries(req.body || {}).filter(([key]) => allowed.includes(key));
  if (!updates.length) return res.status(400).json({ success: false, error: 'No valid fields' });

  if (pg.isPgEnabled()) {
    (async () => {
      try {
        await pg.ensureSchema();
        const oldResult = await pg.pgQuery(`SELECT * FROM "CallLogs" WHERE "ID"=$1`, [Number(id)]);
        const old = oldResult.rows[0];
        if (!old) return res.status(404).json({ success: false, error: 'Contact not found' });

        const setClauses = [];
        const params = [];
        const add = value => {
          params.push(value);
          return `$${params.length}`;
        };

        for (const [key, value] of updates) {
          setClauses.push(`"${key}"=${add(value)}`);
        }
        setClauses.push(`"Updated_At"=now()`);
        params.push(Number(id));

        await pg.pgQuery(`UPDATE "CallLogs" SET ${setClauses.join(',')} WHERE "ID"=$${params.length}`, params);

        for (const [key, value] of updates) {
          if (old[key] !== value) await logActivityPg(id, `${key} Changed`, `${old[key]} -> ${value}`, 'contact', 'User');
        }

        const updated = await pg.pgQuery(`SELECT * FROM "CallLogs" WHERE "ID"=$1`, [Number(id)]);
        res.json({ success: true, data: updated.rows[0] });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    })();
    return;
  }

  try {
    const db = getDb();
    const old = db.prepare('SELECT * FROM CallLogs WHERE ID = ?').get(id);
    if (!old) return res.status(404).json({ success: false, error: 'Contact not found' });

    const setClauses = updates.map(([key]) => `${key}=?`).join(',');
    db.prepare(`UPDATE CallLogs SET ${setClauses},Updated_At=CURRENT_TIMESTAMP WHERE ID=?`)
      .run(...updates.map(([, value]) => value), id);

    updates.forEach(([key, value]) => {
      if (old[key] !== value) logActivitySqlite(db, id, `${key} Changed`, `${old[key]} -> ${value}`, 'contact', 'User');
    });

    res.json({ success: true, data: db.prepare('SELECT * FROM CallLogs WHERE ID = ?').get(id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  const id = req.params.id;

  if (pg.isPgEnabled()) {
    (async () => {
      try {
        await pg.ensureSchema();
        const contactResult = await pg.pgQuery(`SELECT "Attachments" FROM "CallLogs" WHERE "ID"=$1`, [Number(id)]);
        const contact = contactResult.rows[0];
        if (!contact) return res.status(404).json({ success: false, error: 'Not found' });

        const attachments = normalizeAttachmentsPg(contact.Attachments);
        await removeAttachmentBlobsPg(attachments);

        await pg.pgQuery(`DELETE FROM "CallLogs" WHERE "ID"=$1`, [Number(id)]);
        res.json({ success: true, message: 'Contact deleted' });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    })();
    return;
  }

  try {
    const db = getDb();
    const contact = db.prepare('SELECT Attachments FROM CallLogs WHERE ID=?').get(id);
    if (!contact) return res.status(404).json({ success: false, error: 'Not found' });

    removeAttachmentFilesSqlite(parseAttachmentsSqlite(contact.Attachments));
    db.prepare('DELETE FROM CallLogs WHERE ID=?').run(id);
    res.json({ success: true, message: 'Contact deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/calls', (req, res) => {
  const id = req.params.id;

  if (pg.isPgEnabled()) {
    (async () => {
      try {
        await pg.ensureSchema();
        const exists = await pg.pgQuery(`SELECT "ID" FROM "CallLogs" WHERE "ID"=$1`, [Number(id)]);
        if (!exists.rows[0]) return res.status(404).json({ success: false, error: 'Contact not found' });

        const { Outcome, Duration_Min, Notes, Called_By, Next_Action, Next_Call_Date } = req.body || {};
        const sessionResult = await pg.pgQuery(
          `
          INSERT INTO "CallSessions" ("CallLogsID","Outcome","Duration_Min","Notes","Called_By","Next_Action")
          VALUES ($1,$2,$3,$4,$5,$6)
          RETURNING *
          `,
          [
            Number(id),
            Outcome || 'No Answer',
            Number(Duration_Min || 0) || 0,
            Notes || '',
            Called_By || '',
            Next_Action || '',
          ]
        );

        await pg.pgQuery(
          `
          UPDATE "CallLogs"
          SET "Call_Count"="Call_Count"+1,
              "Last_Call_Date"=CURRENT_DATE,
              "Next_Call_Date"=$1,
              "Updated_At"=now()
          WHERE "ID"=$2
          `,
          [Next_Call_Date || null, Number(id)]
        );

        await logActivityPg(id, 'Call Logged', `${Outcome || 'No Answer'} - ${Notes || 'No notes'}`, 'call', Called_By || 'System');
        res.status(201).json({ success: true, data: sessionResult.rows[0] });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    })();
    return;
  }

  try {
    const db = getDb();
    const contact = db.prepare('SELECT ID FROM CallLogs WHERE ID = ?').get(id);
    if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });

    const { Outcome, Duration_Min, Notes, Called_By, Next_Action, Next_Call_Date } = req.body;

    const result = db.prepare(`
      INSERT INTO CallSessions (CallLogsID,Outcome,Duration_Min,Notes,Called_By,Next_Action)
      VALUES (?,?,?,?,?,?)
    `).run(id, Outcome || 'No Answer', Duration_Min || 0, Notes || '', Called_By || '', Next_Action || '');

    db.prepare(`
      UPDATE CallLogs SET Call_Count=Call_Count+1, Last_Call_Date=date('now'),
        Next_Call_Date=?, Updated_At=CURRENT_TIMESTAMP WHERE ID=?
    `).run(Next_Call_Date || null, id);

    logActivitySqlite(db, id, 'Call Logged', `${Outcome} - ${Notes || 'No notes'}`, 'call', Called_By || 'System');

    res.status(201).json({ success: true, data: db.prepare('SELECT * FROM CallSessions WHERE SessionID=?').get(result.lastInsertRowid) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id/calls/:sessionId', (req, res) => {
  const id = req.params.id;
  const sessionId = req.params.sessionId;

  if (pg.isPgEnabled()) {
    (async () => {
      try {
        await pg.ensureSchema();
        const result = await pg.pgQuery(
          `DELETE FROM "CallSessions" WHERE "SessionID"=$1 AND "CallLogsID"=$2 RETURNING "SessionID"`,
          [Number(sessionId), Number(id)]
        );
        if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Call session not found' });

        await pg.pgQuery(
          `
          UPDATE "CallLogs"
          SET "Call_Count"=(SELECT COUNT(*)::int FROM "CallSessions" WHERE "CallLogsID"=$1),
              "Updated_At"=now()
          WHERE "ID"=$1
          `,
          [Number(id)]
        );

        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    })();
    return;
  }

  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM CallSessions WHERE SessionID=? AND CallLogsID=?')
      .run(sessionId, id);

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
    `).run(id, id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/attachments', upload.single('file'), (req, res) => {
  const id = req.params.id;

  if (pg.isPgEnabled()) {
    (async () => {
      try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No file' });
        if (!blobPut || !process.env.BLOB_READ_WRITE_TOKEN) {
          return res.status(501).json({ success: false, error: 'File uploads are not configured. Set BLOB_READ_WRITE_TOKEN.' });
        }

        await pg.ensureSchema();
        const contact = await pg.pgQuery(`SELECT "ID","Attachments" FROM "CallLogs" WHERE "ID"=$1`, [Number(id)]);
        if (!contact.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });

        const keySafeName = String(req.file.originalname || 'file').replace(/[^\w.\- ]+/g, '_').trim().slice(0, 120) || 'file';
        const blobKey = `attachments/${id}/${uuidv4()}-${keySafeName}`;
        const blob = await blobPut(blobKey, req.file.buffer, {
          access: 'public',
          contentType: req.file.mimetype || 'application/octet-stream',
          addRandomSuffix: false,
        });

        const entry = {
          id: uuidv4(),
          filename: req.file.originalname,
          url: blob.url,
          pathname: blob.pathname,
          size: req.file.size,
          contentType: req.file.mimetype || '',
          uploaded: new Date().toISOString(),
        };

        const list = normalizeAttachmentsPg(contact.rows[0].Attachments);
        list.push(entry);

        await pg.pgQuery(
          `UPDATE "CallLogs" SET "Attachments"=$1::jsonb, "Updated_At"=now() WHERE "ID"=$2`,
          [JSON.stringify(list), Number(id)]
        );

        await logActivityPg(id, 'File Attached', req.file.originalname, 'file', 'User');
        res.json({ success: true, data: entry });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    })();
    return;
  }

  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file' });

    const db = getDb();
    const contact = db.prepare('SELECT Attachments FROM CallLogs WHERE ID=?').get(id);
    if (!contact) return res.status(404).json({ success: false, error: 'Not found' });

    const list = parseAttachmentsSqlite(contact.Attachments);
    const entry = {
      id: uuidv4(),
      filename: req.file.originalname,
      path: req.file.filename,
      size: req.file.size,
      uploaded: new Date().toISOString(),
    };

    list.push(entry);

    db.prepare('UPDATE CallLogs SET Attachments=?,Updated_At=CURRENT_TIMESTAMP WHERE ID=?')
      .run(JSON.stringify(list), id);

    logActivitySqlite(db, id, 'File Attached', req.file.originalname, 'file', 'User');
    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id/attachments/:attId', (req, res) => {
  const id = req.params.id;
  const attId = req.params.attId;

  if (pg.isPgEnabled()) {
    (async () => {
      try {
        await pg.ensureSchema();
        const contactResult = await pg.pgQuery(`SELECT "Attachments" FROM "CallLogs" WHERE "ID"=$1`, [Number(id)]);
        const contact = contactResult.rows[0];
        if (!contact) return res.status(404).json({ success: false, error: 'Not found' });

        const list = normalizeAttachmentsPg(contact.Attachments);
        const removed = list.find(file => file?.id === attId);
        const filtered = list.filter(file => file?.id !== attId);

        await pg.pgQuery(
          `UPDATE "CallLogs" SET "Attachments"=$1::jsonb, "Updated_At"=now() WHERE "ID"=$2`,
          [JSON.stringify(filtered), Number(id)]
        );

        if (removed) {
          await removeAttachmentBlobsPg([removed]);
          await logActivityPg(id, 'File Removed', removed.filename || '', 'file', 'User');
        }

        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    })();
    return;
  }

  try {
    const db = getDb();
    const contact = db.prepare('SELECT Attachments FROM CallLogs WHERE ID=?').get(id);
    if (!contact) return res.status(404).json({ success: false, error: 'Not found' });

    const list = parseAttachmentsSqlite(contact.Attachments);
    const removed = list.find(file => file.id === attId);
    const filtered = list.filter(file => file.id !== attId);

    db.prepare('UPDATE CallLogs SET Attachments=?,Updated_At=CURRENT_TIMESTAMP WHERE ID=?')
      .run(JSON.stringify(filtered), id);

    if (removed?.path) {
      const absolutePath = path.join(uploadsDir, removed.path);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
      logActivitySqlite(db, id, 'File Removed', removed.filename, 'file', 'User');
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
