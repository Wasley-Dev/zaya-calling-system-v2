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
  `);

  // Seed minimal settings (same keys as SQLite)
  const defaultSettings = {
    systemName: 'Zaya Calling System',
    systemTagline: 'Enterprise operations workspace',
    welcomeMessage: 'Welcome back',
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
  getSystemSession,
  getSystemSettings,
  listActiveUserNames,
  listLiveSystemUsers,
  listSystemUsers,
  setSystemUserPassword,
  touchSystemSession,
  updateOwnProfile,
  updateSystemSettings,
  updateSystemUser,
};
