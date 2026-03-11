const crypto = require('crypto');
const { Pool } = require('pg');

const CONNECTION_STRING = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const ENABLED = Boolean(CONNECTION_STRING);

let pool = null;
let schemaReady = false;

function isPgEnabled() {
  return ENABLED;
}

function getPool() {
  if (!ENABLED) {
    throw new Error('Postgres is not enabled. Set DATABASE_URL.');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: CONNECTION_STRING,
      // Neon uses TLS; `sslmode=require` is in the URL.
      ssl: { rejectUnauthorized: false },
      max: Number(process.env.PGPOOL_MAX || 20),
    });
  }
  return pool;
}

async function pgQuery(text, params) {
  const client = getPool();
  return client.query(text, params);
}

function createPasswordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const actualHash = crypto.scryptSync(String(password || ''), salt, 64);
  const storedHash = Buffer.from(expectedHash, 'hex');
  return storedHash.length === actualHash.length && crypto.timingSafeEqual(storedHash, actualHash);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSystemRole(value, fallback = 'User') {
  const role = String(value || '').trim();
  if (!role) return fallback;
  if (role === 'Agent') return 'User';
  return ['Super Admin', 'Admin', 'User'].includes(role) ? role : fallback;
}

function sanitizeBackupLabel(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 48);
  return normalized;
}

function getTimestampCompact(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    'Z',
  ].join('');
}

async function seedSampleCandidatesPg() {
  const firstNames = ['Aisha', 'Noah', 'Liam', 'Sophia', 'Mason', 'Olivia', 'Ethan', 'Mia', 'Lucas', 'Emma', 'Zara', 'Hassan', 'Fatima', 'Daniel', 'Grace'];
  const lastNames = ['Taylor', 'Brown', 'Davies', 'Evans', 'Thomas', 'Johnson', 'Walker', 'Wright', 'Hughes', 'Green', 'Hall', 'Lewis', 'Clarke', 'Young', 'Allen'];
  const callerTypes = ['DRIVER', 'MANAGER', 'ACCOUNTANT', 'RECEPTIONIST', 'DISPATCHER', 'COMPLIANCE', 'SALES', 'HR', 'OPERATIONS', 'SUPERVISOR', 'CUSTOMER_SUPPORT'];
  const jobTitleByType = {
    DRIVER: 'Driver',
    MANAGER: 'Operations Manager',
    ACCOUNTANT: 'Accountant',
    RECEPTIONIST: 'Receptionist',
    DISPATCHER: 'Dispatcher',
    COMPLIANCE: 'Compliance Officer',
    SALES: 'Sales Executive',
    HR: 'HR Coordinator',
    OPERATIONS: 'Operations Associate',
    SUPERVISOR: 'Shift Supervisor',
    CUSTOMER_SUPPORT: 'Customer Support',
  };

  for (let i = 0; i < 50; i += 1) {
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[(i * 3) % lastNames.length];
    const callerType = callerTypes[i % callerTypes.length];
    const jobTitle = jobTitleByType[callerType] || 'Candidate';
    const phone = `07${String(700000000 + i * 791).slice(0, 9)}`;
    const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i + 1}@example.com`;
    const status = i % 7 === 0 ? 'Approved' : 'Pending';
    const stage = i % 5 === 0 ? '2 - Training' : '1 - New Caller';
    const priority = i % 9 === 0 ? 'High' : (i % 4 === 0 ? 'Low' : 'Normal');
    const assignee = i % 2 === 0 ? 'Sarah' : 'Mike';
    const nextCall = `2025-01-${String(16 + (i % 12)).padStart(2, '0')}`;

    // eslint-disable-next-line no-await-in-loop
    const inserted = await pgQuery(
      `
      INSERT INTO "CallLogs"
        ("First_Name","Last_Name","Job_Title","Mobile_Phone","E_mail_Address","Address","Country_Region",
         "Caller_Type","Status","Stage","Booking","Remarks","Notes","Priority","Assigned_To","Next_Call_Date","Updated_At")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now())
      RETURNING "ID"
      `,
      [fn, ln, jobTitle, phone, email, 'United Kingdom', 'United Kingdom', callerType, status, stage, '', 'Sample candidate', 'Auto-seeded sample record.', priority, assignee, nextCall]
    );

    const callLogsId = Number(inserted.rows[0].ID);
    // eslint-disable-next-line no-await-in-loop
    await pgQuery(
      `INSERT INTO "ActivityLog" ("CallLogsID","Action","Detail","Entity","Created_By","Created_At") VALUES ($1,$2,$3,$4,$5,now())`,
      [callLogsId, 'Contact Created', `Sample ${callerType} candidate seeded`, 'contact', 'System']
    );

    if (callerType === 'DRIVER') {
      const licenseNo = `DVLA-${2020 + (i % 6)}-${String(1000 + i).padStart(4, '0')}`;
      const cls = i % 3 === 0 ? 'Class C' : 'Class B';
      // eslint-disable-next-line no-await-in-loop
      await pgQuery(
        `
        INSERT INTO "DriverDetails"
          ("CallLogsID","DriverName","LicenseNumber","LicenseClass","LicenseIssueDate","LicenseExpiryDate","DVLACheck","DBSCheck","PCOCheck","VehicleType","Notes","Created_At","Updated_At")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now())
        `,
        [callLogsId, `${fn} ${ln}`, licenseNo, cls, '2021-01-01', '2028-01-01', 'Pending', 'Pending', 'Pending', i % 2 === 0 ? 'Van' : 'Car', '']
      );
    }
  }
}

async function ensureSchema() {
  if (!ENABLED || schemaReady) return;

  // Tables
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS "CallLogs" (
      "ID"              BIGSERIAL PRIMARY KEY,
      "First_Name"      TEXT NOT NULL DEFAULT '',
      "Last_Name"       TEXT DEFAULT '',
      "Job_Title"       TEXT DEFAULT '',
      "Mobile_Phone"    TEXT DEFAULT '',
      "E_mail_Address"  TEXT DEFAULT '',
      "Address"         TEXT DEFAULT '',
      "Country_Region"  TEXT DEFAULT 'United Kingdom',
      "Caller_Type"     TEXT DEFAULT 'DRIVER',
      "Status"          TEXT DEFAULT 'Pending',
      "Stage"           TEXT DEFAULT '1 - New Caller',
      "Booking"         TEXT DEFAULT '',
      "Documentations"  TEXT DEFAULT '',
      "Remarks"         TEXT DEFAULT '',
      "Notes"           TEXT DEFAULT '',
      "Attachments"     JSONB NOT NULL DEFAULT '[]'::jsonb,
      "Priority"        TEXT DEFAULT 'Normal',
      "Assigned_To"     TEXT DEFAULT '',
      "Last_Call_Date"  DATE,
      "Next_Call_Date"  DATE,
      "Call_Count"      INTEGER NOT NULL DEFAULT 0,
      "Created_At"      TIMESTAMPTZ NOT NULL DEFAULT now(),
      "Updated_At"      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "DriverDetails" (
      "DriverDetailID"    BIGSERIAL PRIMARY KEY,
      "CallLogsID"        BIGINT NOT NULL UNIQUE REFERENCES "CallLogs"("ID") ON DELETE CASCADE,
      "DriverName"        TEXT DEFAULT '',
      "LicenseNumber"     TEXT DEFAULT '',
      "LicenseClass"      TEXT DEFAULT '',
      "LicenseIssueDate"  DATE,
      "LicenseExpiryDate" DATE,
      "DVLACheck"         TEXT DEFAULT 'Pending',
      "DBSCheck"          TEXT DEFAULT 'Pending',
      "PCOCheck"          TEXT DEFAULT 'Pending',
      "VehicleType"       TEXT DEFAULT '',
      "Notes"             TEXT DEFAULT '',
      "Created_At"        TIMESTAMPTZ NOT NULL DEFAULT now(),
      "Updated_At"        TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "CallSessions" (
      "SessionID"    BIGSERIAL PRIMARY KEY,
      "CallLogsID"   BIGINT NOT NULL REFERENCES "CallLogs"("ID") ON DELETE CASCADE,
      "Outcome"      TEXT DEFAULT 'No Answer',
      "Duration_Min" INTEGER NOT NULL DEFAULT 0,
      "Notes"        TEXT DEFAULT '',
      "Called_By"    TEXT DEFAULT '',
      "Called_At"    TIMESTAMPTZ NOT NULL DEFAULT now(),
      "Next_Action"  TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS "ActivityLog" (
      "ActivityID"   BIGSERIAL PRIMARY KEY,
      "CallLogsID"   BIGINT REFERENCES "CallLogs"("ID") ON DELETE SET NULL,
      "Action"       TEXT NOT NULL,
      "Detail"       TEXT DEFAULT '',
      "Entity"       TEXT DEFAULT 'contact',
      "Created_By"   TEXT DEFAULT 'System',
      "Created_At"   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "SystemUsers" (
      "UserID"         BIGSERIAL PRIMARY KEY,
      "Name"           TEXT NOT NULL,
      "Email"          TEXT NOT NULL UNIQUE,
      "Avatar_URL"     TEXT DEFAULT '',
      "Role"           TEXT NOT NULL DEFAULT 'User',
      "Password_Salt"  TEXT NOT NULL,
      "Password_Hash"  TEXT NOT NULL,
      "IsActive"       BOOLEAN NOT NULL DEFAULT true,
      "Last_Login_At"  TIMESTAMPTZ,
      "Created_At"     TIMESTAMPTZ NOT NULL DEFAULT now(),
      "Updated_At"     TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "SystemSessions" (
      "SessionID"     UUID PRIMARY KEY,
      "UserID"        BIGINT NOT NULL REFERENCES "SystemUsers"("UserID") ON DELETE CASCADE,
      "Is_Online"     BOOLEAN NOT NULL DEFAULT true,
      "IP_Address"    TEXT DEFAULT '',
      "Geo_Country"   TEXT DEFAULT '',
      "Geo_Region"    TEXT DEFAULT '',
      "Geo_City"      TEXT DEFAULT '',
      "User_Agent"    TEXT DEFAULT '',
      "Last_Seen_At"  TIMESTAMPTZ NOT NULL DEFAULT now(),
      "Created_At"    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "SystemSettings" (
      "Setting_Key"   TEXT PRIMARY KEY,
      "Setting_Value" TEXT NOT NULL DEFAULT '',
      "Updated_At"    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "SystemBackups" (
      "BackupName" TEXT PRIMARY KEY,
      "Type"       TEXT NOT NULL DEFAULT 'manual',
      "Label"      TEXT NOT NULL DEFAULT '',
      "Size"       BIGINT NOT NULL DEFAULT 0,
      "Payload"    JSONB NOT NULL,
      "Created_At" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "Updated_At" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Indexes
  await pgQuery(`
    CREATE INDEX IF NOT EXISTS idx_cl_status ON "CallLogs"("Status");
    CREATE INDEX IF NOT EXISTS idx_cl_stage ON "CallLogs"("Stage");
    CREATE INDEX IF NOT EXISTS idx_cl_type ON "CallLogs"("Caller_Type");
    CREATE INDEX IF NOT EXISTS idx_cl_next_call ON "CallLogs"("Next_Call_Date");
    CREATE INDEX IF NOT EXISTS idx_dd_contact ON "DriverDetails"("CallLogsID");
    CREATE INDEX IF NOT EXISTS idx_cs_contact ON "CallSessions"("CallLogsID");
    CREATE INDEX IF NOT EXISTS idx_activity_time ON "ActivityLog"("Created_At");
    CREATE INDEX IF NOT EXISTS idx_system_users_email ON "SystemUsers"("Email");
    CREATE INDEX IF NOT EXISTS idx_system_sessions_user ON "SystemSessions"("UserID");
    CREATE INDEX IF NOT EXISTS idx_system_backups_time ON "SystemBackups"("Created_At");
  `);

  // Seed minimal settings (same keys as SQLite)
  const defaultSettings = {
    systemName: 'Zaya Calling System',
    systemTagline: 'Enterprise operations workspace',
    welcomeMessage: 'Welcome back',
    systemSummary: 'Corporate dark and light aligned to the logo palette',
    logoUrl: '/zaya-logo.png?v=20260309-2',
    // New image per day (UTC). Admins can add/remove URLs in System Settings.
    loginImage: [
      'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=1600',
      'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1600',
      'https://images.pexels.com/photos/3861969/pexels-photo-3861969.jpeg?auto=compress&cs=tinysrgb&w=1600',
      'https://images.pexels.com/photos/7654576/pexels-photo-7654576.jpeg?auto=compress&cs=tinysrgb&w=1600',
    ].join('\n'),
    appBackgroundImage: '',
    loginHeadline: "Enter with today's business-development focus.",
    loginCopy: 'Use the workspace to convert follow-up clarity into pipeline movement and stronger execution.',
    quote: 'Growth becomes predictable when every interaction leaves the client with less uncertainty than before.',
    quoteAuthor: 'Enterprise Strategy Note',
    facts: JSON.stringify([
      'Development velocity improves when teams document decisions once and reuse them everywhere.',
      'Consistent follow-up habits drive more growth than last-minute bursts of activity.',
      'Shared dashboards reduce status meetings and increase execution time.',
      'Productivity scales when teams remove duplicate entry and standardize workflows.',
      'Clear ownership shortens delivery cycles and improves operational quality.',
      'Small process improvements compound into major output gains over a quarter.',
      'Growth is easier to sustain when reporting, calling, and compliance stay in one system.',
      'Strong internal tools reduce friction for both managers and frontline teams.',
    ]),
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    await pgQuery(
      `
      INSERT INTO "SystemSettings" ("Setting_Key","Setting_Value","Updated_At")
      VALUES ($1,$2,now())
      ON CONFLICT ("Setting_Key") DO NOTHING
      `,
      [key, String(value)]
    );
  }

  // One-time upgrade for older seeds (keeps admin changes intact).
  // If the current values match the previous hardcoded defaults, replace them with the new pools.
  const existingLoginImage = await pgQuery(`SELECT "Setting_Value" FROM "SystemSettings" WHERE "Setting_Key"='loginImage'`);
  if (existingLoginImage.rows[0]?.Setting_Value === '/login-visual.jpg?v=20260309-2') {
    await pgQuery(
      `UPDATE "SystemSettings" SET "Setting_Value"=$1, "Updated_At"=now() WHERE "Setting_Key"='loginImage'`,
      [String(defaultSettings.loginImage)]
    );
  }
  const existingFacts = await pgQuery(`SELECT "Setting_Value" FROM "SystemSettings" WHERE "Setting_Key"='facts'`);
  if (existingFacts.rows[0]?.Setting_Value === JSON.stringify([
    'Sales velocity improves when handoffs between sourcing, calling, and compliance are explicit.',
    'Most stalled deals are process problems before they become people problems.',
    'Teams that measure next-action quality usually outperform teams that only measure volume.',
  ])) {
    await pgQuery(
      `UPDATE "SystemSettings" SET "Setting_Value"=$1, "Updated_At"=now() WHERE "Setting_Key"='facts'`,
      [String(defaultSettings.facts)]
    );
  }

  // Ensure bootstrap admin exists
  const email = normalizeEmail(process.env.ADMIN_EMAIL || 'it@zayagroupltd.com');
  const password = String(process.env.ADMIN_PASSWORD || 'Kingsley06#').trim();
  if (email && password) {
    const { salt, hash } = createPasswordHash(password);
    await pgQuery(
      `
      INSERT INTO "SystemUsers" ("Name","Email","Role","Password_Salt","Password_Hash","IsActive","Updated_At")
      VALUES ($1,$2,'Super Admin',$3,$4,true,now())
      ON CONFLICT ("Email") DO UPDATE SET
        "Name" = EXCLUDED."Name",
        "Role" = 'Super Admin',
        "Password_Salt" = EXCLUDED."Password_Salt",
        "Password_Hash" = EXCLUDED."Password_Hash",
        "IsActive" = true,
        "Updated_At" = now()
      `,
      ['Zaya Operations', email, salt, hash]
    );
  }

  // Seed sample candidates once (only on empty databases).
  const callLogCount = await pgQuery(`SELECT COUNT(*)::int AS c FROM "CallLogs"`);
  if (Number(callLogCount.rows[0]?.c || 0) === 0) {
    await seedSampleCandidatesPg();
  }

  schemaReady = true;
}

async function withSchema(fn) {
  await ensureSchema();
  return fn();
}

async function listSystemUsers() {
  return withSchema(async () => {
    const result = await pgQuery(
      `
      SELECT su."UserID", su."Name", su."Email", su."Avatar_URL", su."Role", su."IsActive",
             su."Last_Login_At", su."Created_At", su."Updated_At",
             ss."SessionID", ss."Is_Online" AS "Session_Is_Online", ss."IP_Address", ss."Geo_Country", ss."Geo_Region", ss."Geo_City",
             ss."User_Agent", ss."Last_Seen_At" AS "Session_Last_Seen_At"
      FROM "SystemUsers" su
      LEFT JOIN LATERAL (
        SELECT s.*
        FROM "SystemSessions" s
        WHERE s."UserID" = su."UserID"
        ORDER BY s."Created_At" DESC
        LIMIT 1
      ) ss ON true
      ORDER BY
        CASE su."Role"
          WHEN 'Super Admin' THEN 0
          WHEN 'Admin' THEN 1
          ELSE 2
        END,
        su."Name" ASC
      `
    );

    return result.rows.map(row => ({
      id: Number(row.UserID),
      name: row.Name,
      email: row.Email,
      avatarUrl: row.Avatar_URL || '',
      role: row.Role === 'Agent' ? 'User' : row.Role,
      isActive: Boolean(row.IsActive),
      lastLoginAt: row.Last_Login_At,
      createdAt: row.Created_At,
      updatedAt: row.Updated_At,
      session: row.SessionID ? {
        sessionId: row.SessionID,
        isOnline: Boolean(row.Session_Is_Online),
        ipAddress: row.IP_Address || '',
        location: [row.Geo_City, row.Geo_Region, row.Geo_Country].filter(Boolean).join(', '),
        lastSeenAt: row.Session_Last_Seen_At || row.Last_Login_At,
        userAgent: row.User_Agent || '',
      } : null,
    }));
  });
}

async function getSystemUserByEmail(email) {
  const normalized = normalizeEmail(email);
  const result = await pgQuery(`SELECT * FROM "SystemUsers" WHERE "Email" = $1`, [normalized]);
  return result.rows[0] || null;
}

async function getSystemUserById(userId) {
  const result = await pgQuery(
    `SELECT "UserID","Name","Email","Avatar_URL","Role","IsActive","Last_Login_At","Created_At","Updated_At" FROM "SystemUsers" WHERE "UserID"=$1`,
    [Number(userId)]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: Number(row.UserID),
    name: row.Name,
    email: row.Email,
    avatarUrl: row.Avatar_URL || '',
    role: row.Role === 'Agent' ? 'User' : row.Role,
    isActive: Boolean(row.IsActive),
    lastLoginAt: row.Last_Login_At,
    createdAt: row.Created_At,
    updatedAt: row.Updated_At,
  };
}

async function authenticateSystemUser(email, password) {
  return withSchema(async () => {
    const normalized = normalizeEmail(email);
    const row = await getSystemUserByEmail(normalized);
    if (!row || !row.IsActive) return null;
    if (!verifyPassword(password, row.Password_Salt, row.Password_Hash)) return null;
    await pgQuery(`UPDATE "SystemUsers" SET "Last_Login_At"=now(), "Updated_At"=now() WHERE "UserID"=$1`, [Number(row.UserID)]);
    return getSystemUserById(row.UserID);
  });
}

async function createSystemUser({ name, email, role = 'User', password, isActive = true }) {
  return withSchema(async () => {
    const normalizedEmail = normalizeEmail(email);
    if (!String(name || '').trim() || !normalizedEmail || !String(password || '').trim()) {
      throw new Error('Name, email, and password are required.');
    }
    const normalizedRole = normalizeSystemRole(role);

    const existing = await getSystemUserByEmail(normalizedEmail);
    if (existing) throw new Error('A user with this email already exists.');

    const { salt, hash } = createPasswordHash(password);
    const result = await pgQuery(
      `
      INSERT INTO "SystemUsers" ("Name","Email","Role","Password_Salt","Password_Hash","IsActive","Created_At","Updated_At")
      VALUES ($1,$2,$3,$4,$5,$6,now(),now())
      RETURNING "UserID"
      `,
      [String(name).trim(), normalizedEmail, normalizedRole, salt, hash, Boolean(isActive)]
    );
    return getSystemUserById(result.rows[0].UserID);
  });
}

async function updateSystemUser(userId, { name, role, isActive }) {
  return withSchema(async () => {
    const existing = await getSystemUserById(userId);
    if (!existing) throw new Error('User not found.');
    const nextName = String(name || existing.name).trim();
    const nextRole = normalizeSystemRole(role, existing.role || 'User');
    const nextActive = isActive === undefined ? Boolean(existing.isActive) : Boolean(isActive);
    await pgQuery(
      `UPDATE "SystemUsers" SET "Name"=$1,"Role"=$2,"IsActive"=$3,"Updated_At"=now() WHERE "UserID"=$4`,
      [nextName, nextRole, nextActive, Number(userId)]
    );
    return getSystemUserById(userId);
  });
}

async function setSystemUserPassword(userId, password) {
  return withSchema(async () => {
    if (!String(password || '').trim()) throw new Error('Password is required.');
    const existing = await getSystemUserById(userId);
    if (!existing) throw new Error('User not found.');
    const { salt, hash } = createPasswordHash(password);
    await pgQuery(
      `UPDATE "SystemUsers" SET "Password_Salt"=$1,"Password_Hash"=$2,"Updated_At"=now() WHERE "UserID"=$3`,
      [salt, hash, Number(userId)]
    );
    return getSystemUserById(userId);
  });
}

async function updateOwnProfile(userId, { name, avatarUrl } = {}) {
  return withSchema(async () => {
    const existing = await getSystemUserById(userId);
    if (!existing) throw new Error('User not found.');
    const nextName = String(name || '').trim();
    if (!nextName) throw new Error('Name is required.');
    await pgQuery(
      `UPDATE "SystemUsers" SET "Name"=$1,"Avatar_URL"=$2,"Updated_At"=now() WHERE "UserID"=$3`,
      [nextName, String(avatarUrl || '').trim(), Number(userId)]
    );
    return getSystemUserById(userId);
  });
}

async function changeOwnPassword(userId, currentPassword, nextPassword) {
  return withSchema(async () => {
    const result = await pgQuery(`SELECT "UserID","Password_Salt","Password_Hash" FROM "SystemUsers" WHERE "UserID"=$1`, [Number(userId)]);
    const row = result.rows[0];
    if (!row) throw new Error('User not found.');
    if (!verifyPassword(currentPassword, row.Password_Salt, row.Password_Hash)) throw new Error('Current password is incorrect.');
    if (!String(nextPassword || '').trim()) throw new Error('New password is required.');
    const { salt, hash } = createPasswordHash(nextPassword);
    await pgQuery(`UPDATE "SystemUsers" SET "Password_Salt"=$1,"Password_Hash"=$2,"Updated_At"=now() WHERE "UserID"=$3`, [salt, hash, Number(userId)]);
    return getSystemUserById(userId);
  });
}

async function createSystemSession(userId, context = {}) {
  return withSchema(async () => {
    const sessionId = crypto.randomUUID();
    await pgQuery(
      `
      INSERT INTO "SystemSessions" ("SessionID","UserID","Is_Online","IP_Address","Geo_Country","Geo_Region","Geo_City","User_Agent","Last_Seen_At","Created_At")
      VALUES ($1,$2,true,$3,$4,$5,$6,$7,now(),now())
      `,
      [
        sessionId,
        Number(userId),
        String(context.ipAddress || '').trim(),
        String(context.geoCountry || '').trim(),
        String(context.geoRegion || '').trim(),
        String(context.geoCity || '').trim(),
        String(context.userAgent || '').trim(),
      ]
    );
    return getSystemSession(sessionId);
  });
}

async function getSystemSession(sessionId) {
  return withSchema(async () => {
    const result = await pgQuery(
      `
      SELECT ss.*, su."Name", su."Email", su."Avatar_URL", su."Role"
      FROM "SystemSessions" ss
      JOIN "SystemUsers" su ON su."UserID" = ss."UserID"
      WHERE ss."SessionID" = $1
      `,
      [String(sessionId)]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      sessionId: row.SessionID,
      userId: Number(row.UserID),
      name: row.Name,
      email: row.Email,
      avatarUrl: row.Avatar_URL || '',
      role: row.Role === 'Agent' ? 'User' : row.Role,
      isOnline: Boolean(row.Is_Online),
      ipAddress: row.IP_Address || '',
      location: [row.Geo_City, row.Geo_Region, row.Geo_Country].filter(Boolean).join(', '),
      lastSeenAt: row.Last_Seen_At,
      createdAt: row.Created_At,
      userAgent: row.User_Agent || '',
    };
  });
}

async function touchSystemSession(sessionId, context = {}) {
  return withSchema(async () => {
    const existing = await getSystemSession(sessionId);
    if (!existing) throw new Error('Session not found.');
    await pgQuery(
      `
      UPDATE "SystemSessions"
      SET "Is_Online"=true,
          "IP_Address"=COALESCE(NULLIF($1,''),"IP_Address"),
          "Geo_Country"=COALESCE(NULLIF($2,''),"Geo_Country"),
          "Geo_Region"=COALESCE(NULLIF($3,''),"Geo_Region"),
          "Geo_City"=COALESCE(NULLIF($4,''),"Geo_City"),
          "User_Agent"=COALESCE(NULLIF($5,''),"User_Agent"),
          "Last_Seen_At"=now()
      WHERE "SessionID"=$6
      `,
      [
        String(context.ipAddress || '').trim(),
        String(context.geoCountry || '').trim(),
        String(context.geoRegion || '').trim(),
        String(context.geoCity || '').trim(),
        String(context.userAgent || '').trim(),
        String(sessionId),
      ]
    );
    return getSystemSession(sessionId);
  });
}

async function closeSystemSession(sessionId) {
  return withSchema(async () => {
    await pgQuery(`UPDATE "SystemSessions" SET "Is_Online"=false, "Last_Seen_At"=now() WHERE "SessionID"=$1`, [String(sessionId)]);
  });
}

async function listActiveUserNames() {
  return withSchema(async () => {
    const result = await pgQuery(`SELECT "Name" FROM "SystemUsers" WHERE "IsActive"=true ORDER BY "Name" ASC`);
    return result.rows.map(r => r.Name);
  });
}

async function listLiveSystemUsers() {
  return withSchema(async () => {
    const result = await pgQuery(
      `
      SELECT ss.*, su."Name", su."Email", su."Avatar_URL", su."Role"
      FROM "SystemSessions" ss
      JOIN "SystemUsers" su ON su."UserID" = ss."UserID"
      WHERE ss."Is_Online"=true
        AND ss."Last_Seen_At" >= (now() - interval '10 minutes')
      ORDER BY ss."Last_Seen_At" DESC
      `
    );
    return result.rows.map(row => ({
      sessionId: row.SessionID,
      userId: Number(row.UserID),
      name: row.Name,
      email: row.Email,
      avatarUrl: row.Avatar_URL || '',
      role: row.Role === 'Agent' ? 'User' : row.Role,
      ipAddress: row.IP_Address || '',
      location: [row.Geo_City, row.Geo_Region, row.Geo_Country].filter(Boolean).join(', '),
      lastSeenAt: row.Last_Seen_At,
      createdAt: row.Created_At,
      userAgent: row.User_Agent || '',
    }));
  });
}

async function getSystemSettings() {
  return withSchema(async () => {
    const result = await pgQuery(`SELECT "Setting_Key","Setting_Value" FROM "SystemSettings" ORDER BY "Setting_Key" ASC`);
    const settings = {
      systemName: 'Zaya Calling System',
      systemTagline: 'Enterprise operations workspace',
      welcomeMessage: 'Welcome back',
      logoUrl: '/zaya-logo.png?v=20260309-2',
      loginImage: '/login-visual.jpg?v=20260309-2',
      appBackgroundImage: '',
      loginHeadline: '',
      loginCopy: '',
      quote: '',
      quoteAuthor: '',
      facts: [],
    };
    for (const row of result.rows) {
      if (row.Setting_Key === 'facts') {
        try {
          settings.facts = JSON.parse(row.Setting_Value || '[]');
        } catch (_) {
          settings.facts = [];
        }
      } else {
        settings[row.Setting_Key] = row.Setting_Value;
      }
    }
    return settings;
  });
}

async function updateSystemSettings(patch = {}) {
  return withSchema(async () => {
    const keys = [
      'systemName',
      'systemTagline',
      'welcomeMessage',
      'systemSummary',
      'logoUrl',
      'loginImage',
      'appBackgroundImage',
      'loginHeadline',
      'loginCopy',
      'quote',
      'quoteAuthor',
      'facts',
    ];
    for (const key of keys) {
      if (!(key in patch)) continue;
      const value = key === 'facts' ? JSON.stringify(Array.isArray(patch[key]) ? patch[key].map(v => String(v).trim()).filter(Boolean) : []) : String(patch[key] || '').trim();
      await pgQuery(
        `
        INSERT INTO "SystemSettings" ("Setting_Key","Setting_Value","Updated_At")
        VALUES ($1,$2,now())
        ON CONFLICT ("Setting_Key") DO UPDATE SET
          "Setting_Value"=EXCLUDED."Setting_Value",
          "Updated_At"=now()
        `,
        [key, value]
      );
    }
    return getSystemSettings();
  });
}

async function closePg() {
  if (!pool) return;
  await pool.end();
  pool = null;
  schemaReady = false;
}

async function listSystemBackups() {
  return withSchema(async () => {
    const result = await pgQuery(
      `
      SELECT "BackupName" AS name, "Type" AS type, "Size" AS size, "Created_At" AS "createdAt", "Updated_At" AS "updatedAt"
      FROM "SystemBackups"
      ORDER BY "Created_At" DESC
      LIMIT 50
      `
    );
    return result.rows.map(row => ({
      name: row.name,
      type: row.type,
      size: Number(row.size || 0),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  });
}

async function createSystemBackup({ type = 'manual', label = '' } = {}) {
  return withSchema(async () => {
    const safeLabel = sanitizeBackupLabel(label);
    const name = `${getTimestampCompact()}-${String(type || 'manual')}${safeLabel ? `-${safeLabel}` : ''}.json`;

    const tables = {};
    const fetchAll = async (sql, params = []) => (await pgQuery(sql, params)).rows;

    tables.CallLogs = await fetchAll(`SELECT * FROM "CallLogs" ORDER BY "ID" ASC`);
    tables.DriverDetails = await fetchAll(`SELECT * FROM "DriverDetails" ORDER BY "DriverDetailID" ASC`);
    tables.CallSessions = await fetchAll(`SELECT * FROM "CallSessions" ORDER BY "SessionID" ASC`);
    tables.ActivityLog = await fetchAll(`SELECT * FROM "ActivityLog" ORDER BY "ActivityID" ASC`);
    tables.SystemUsers = await fetchAll(`SELECT * FROM "SystemUsers" ORDER BY "UserID" ASC`);
    tables.SystemSettings = await fetchAll(`SELECT * FROM "SystemSettings" ORDER BY "Setting_Key" ASC`);

    const payload = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      tables,
    };

    const json = JSON.stringify(payload);
    const size = Buffer.byteLength(json, 'utf8');

    await pgQuery(
      `
      INSERT INTO "SystemBackups" ("BackupName","Type","Label","Size","Payload","Created_At","Updated_At")
      VALUES ($1,$2,$3,$4,$5::jsonb,now(),now())
      `,
      [name, String(type || 'manual'), String(label || ''), size, json]
    );

    // Keep a small window of automated backups.
    if (String(type || '').toLowerCase() === 'auto') {
      await pgQuery(`
        DELETE FROM "SystemBackups"
        WHERE "BackupName" IN (
          SELECT "BackupName"
          FROM "SystemBackups"
          WHERE "Type"='auto'
          ORDER BY "Created_At" DESC
          OFFSET 14
        )
      `);
    }

    return {
      name,
      type: String(type || 'manual'),
      size,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });
}

async function restoreSystemBackup(backupName) {
  return withSchema(async () => {
    const safeName = String(backupName || '').trim();
    if (!safeName) throw new Error('Backup name is required.');

    const backupResult = await pgQuery(
      `SELECT "BackupName","Payload" FROM "SystemBackups" WHERE "BackupName"=$1`,
      [safeName]
    );
    const backupRow = backupResult.rows[0];
    if (!backupRow) throw new Error('Backup file not found.');

    // Safety copy first.
    await createSystemBackup({ type: 'pre-restore', label: 'safety-copy' });

    const payload = backupRow.Payload;
    const tables = payload?.tables || {};

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');

      // Clear sessions first (online tracking), then data tables.
      await client.query(`TRUNCATE "SystemSessions" RESTART IDENTITY CASCADE`);

      await client.query(`TRUNCATE "CallSessions","DriverDetails","ActivityLog","CallLogs" RESTART IDENTITY CASCADE`);
      await client.query(`TRUNCATE "SystemSettings" RESTART IDENTITY CASCADE`);
      await client.query(`TRUNCATE "SystemUsers" RESTART IDENTITY CASCADE`);

      const insertMany = async (tableName, rows, columns) => {
        if (!Array.isArray(rows) || !rows.length) return;
        const colList = columns.map(c => `"${c}"`).join(',');
        const valuesSql = columns.map((_, idx) => `$${idx + 1}`).join(',');
        const sql = `INSERT INTO "${tableName}" (${colList}) VALUES (${valuesSql})`;
        for (const row of rows) {
          const params = columns.map(col => row[col] === undefined ? null : row[col]);
          // eslint-disable-next-line no-await-in-loop
          await client.query(sql, params);
        }
      };

      await insertMany('SystemUsers', tables.SystemUsers, [
        'UserID',
        'Name',
        'Email',
        'Avatar_URL',
        'Role',
        'Password_Salt',
        'Password_Hash',
        'IsActive',
        'Last_Login_At',
        'Created_At',
        'Updated_At',
      ]);

      await insertMany('SystemSettings', tables.SystemSettings, ['Setting_Key', 'Setting_Value', 'Updated_At']);

      await insertMany('CallLogs', tables.CallLogs, [
        'ID',
        'First_Name',
        'Last_Name',
        'Job_Title',
        'Mobile_Phone',
        'E_mail_Address',
        'Address',
        'Country_Region',
        'Caller_Type',
        'Status',
        'Stage',
        'Booking',
        'Documentations',
        'Remarks',
        'Notes',
        'Attachments',
        'Priority',
        'Assigned_To',
        'Last_Call_Date',
        'Next_Call_Date',
        'Call_Count',
        'Created_At',
        'Updated_At',
      ]);

      await insertMany('DriverDetails', tables.DriverDetails, [
        'DriverDetailID',
        'CallLogsID',
        'DriverName',
        'LicenseNumber',
        'LicenseClass',
        'LicenseIssueDate',
        'LicenseExpiryDate',
        'DVLACheck',
        'DBSCheck',
        'PCOCheck',
        'VehicleType',
        'Notes',
        'Created_At',
        'Updated_At',
      ]);

      await insertMany('CallSessions', tables.CallSessions, [
        'SessionID',
        'CallLogsID',
        'Outcome',
        'Duration_Min',
        'Notes',
        'Called_By',
        'Called_At',
        'Next_Action',
      ]);

      await insertMany('ActivityLog', tables.ActivityLog, [
        'ActivityID',
        'CallLogsID',
        'Action',
        'Detail',
        'Entity',
        'Created_By',
        'Created_At',
      ]);

      // Reset sequences to max IDs (if any).
      await client.query(`SELECT setval(pg_get_serial_sequence('"CallLogs"','ID'), GREATEST((SELECT COALESCE(MAX("ID"),0) FROM "CallLogs"), 1), true)`);
      await client.query(`SELECT setval(pg_get_serial_sequence('"DriverDetails"','DriverDetailID'), GREATEST((SELECT COALESCE(MAX("DriverDetailID"),0) FROM "DriverDetails"), 1), true)`);
      await client.query(`SELECT setval(pg_get_serial_sequence('"CallSessions"','SessionID'), GREATEST((SELECT COALESCE(MAX("SessionID"),0) FROM "CallSessions"), 1), true)`);
      await client.query(`SELECT setval(pg_get_serial_sequence('"ActivityLog"','ActivityID'), GREATEST((SELECT COALESCE(MAX("ActivityID"),0) FROM "ActivityLog"), 1), true)`);
      await client.query(`SELECT setval(pg_get_serial_sequence('"SystemUsers"','UserID'), GREATEST((SELECT COALESCE(MAX("UserID"),0) FROM "SystemUsers"), 1), true)`);

      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw error;
    } finally {
      client.release();
    }

    // Re-assert bootstrap super admin after restore.
    schemaReady = false;
    await ensureSchema();

    const usersNow = await pgQuery(`SELECT COUNT(*)::int AS c FROM "SystemUsers"`);
    return {
      restored: safeName,
      currentUsers: Number(usersNow.rows[0]?.c || 0),
    };
  });
}

module.exports = {
  isPgEnabled,
  pgQuery,
  ensureSchema,
  closePg,
  // system helpers
  authenticateSystemUser,
  changeOwnPassword,
  closeSystemSession,
  createSystemSession,
  createSystemUser,
  createSystemBackup,
  getSystemSession,
  getSystemSettings,
  listActiveUserNames,
  listSystemBackups,
  listLiveSystemUsers,
  listSystemUsers,
  restoreSystemBackup,
  setSystemUserPassword,
  touchSystemSession,
  updateOwnProfile,
  updateSystemSettings,
  updateSystemUser,
};
