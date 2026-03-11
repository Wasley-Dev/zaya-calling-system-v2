const Database = require('better-sqlite3');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

let db;
const SYSTEM_ROLES = ['Super Admin', 'Admin', 'User'];
const ROOT_SYSTEM_EMAIL = 'it@zayagroupltd.com';
const DEFAULT_ROTATING_LOGIN_IMAGES = [
  'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/3861969/pexels-photo-3861969.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/7654576/pexels-photo-7654576.jpeg?auto=compress&cs=tinysrgb&w=1600',
];
const DEFAULT_CORPORATE_FACTS = [
  'Development velocity improves when teams document decisions once and reuse them everywhere.',
  'Consistent follow-up habits drive more growth than last-minute bursts of activity.',
  'Shared dashboards reduce status meetings and increase execution time.',
  'Productivity scales when teams remove duplicate entry and standardize workflows.',
  'Clear ownership shortens delivery cycles and improves operational quality.',
  'Small process improvements compound into major output gains over a quarter.',
  'Growth is easier to sustain when reporting, calling, and compliance stay in one system.',
  'Strong internal tools reduce friction for both managers and frontline teams.',
];
const DEFAULT_SYSTEM_SETTINGS = {
  systemName: 'Zaya Calling System',
  systemTagline: 'Enterprise operations workspace',
  welcomeMessage: 'Welcome back',
  logoUrl: '/zaya-logo.png?v=20260309-2',
  loginImage: DEFAULT_ROTATING_LOGIN_IMAGES.join('\n'),
  appBackgroundImage: '',
  loginHeadline: "Enter with today's business-development focus.",
  loginCopy: 'Use the workspace to convert follow-up clarity into pipeline movement and stronger execution.',
  quote: 'Growth becomes predictable when every interaction leaves the client with less uncertainty than before.',
  quoteAuthor: 'Enterprise Strategy Note',
  facts: DEFAULT_CORPORATE_FACTS,
};

function getStoragePaths() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/zaya.db');
  const dataDir = process.env.DATA_DIR || path.dirname(dbPath);
  const backupsDir = process.env.BACKUPS_DIR || path.join(dataDir, 'backups');
  return {
    dbPath,
    dataDir,
    backupsDir,
  };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getSafeStoragePaths() {
  // If the configured path is not writable/doesn't exist (common on locked-down installs),
  // fall back to a per-user directory that should always be writable.
  const rootDir = process.env.VERCEL
    ? path.join(os.tmpdir(), 'zaya-runtime')
    : path.join(os.homedir(), '.zaya-calling-system');
  const dataDir = path.join(rootDir, 'data');
  const backupsDir = path.join(rootDir, 'backups');
  return {
    dbPath: path.join(dataDir, 'zaya.db'),
    dataDir,
    backupsDir,
  };
}

function ensureStorageDirs() {
  const primaryPaths = getStoragePaths();

  try {
    ensureDir(path.dirname(primaryPaths.dbPath));
    ensureDir(primaryPaths.dataDir);
    ensureDir(primaryPaths.backupsDir);
    return primaryPaths;
  } catch (_) {
    const fallbackPaths = getSafeStoragePaths();
    ensureDir(path.dirname(fallbackPaths.dbPath));
    ensureDir(fallbackPaths.dataDir);
    ensureDir(fallbackPaths.backupsDir);
    process.env.DB_PATH = fallbackPaths.dbPath;
    process.env.DATA_DIR = fallbackPaths.dataDir;
    process.env.BACKUPS_DIR = fallbackPaths.backupsDir;
    return fallbackPaths;
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isProtectedSystemEmail(value) {
  return normalizeEmail(value) === ROOT_SYSTEM_EMAIL;
}

function normalizeSystemRole(value, fallback = 'User') {
  const role = String(value || '').trim();
  if (!role) return fallback;
  if (role === 'Agent') return 'User';
  return SYSTEM_ROLES.includes(role) ? role : fallback;
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

function sanitizeBackupLabel(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function serializeUser(row) {
  if (!row) return null;
  return {
    id: row.UserID,
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
  };
}

function getDb() {
  if (!db) {
    const { dbPath } = ensureStorageDirs();
    db = new Database(dbPath);
    if (!process.env.VERCEL) {
      db.pragma('journal_mode = WAL');
    }
    db.pragma('foreign_keys = ON');
    initializeSchema();
    ensureBootstrapAdmin();
  }
  return db;
}

function closeDb() {
  if (!db) return;
  db.close();
  db = null;
}

function initializeSchema() {
  const database = db;
  database.exec(`
    CREATE TABLE IF NOT EXISTS CallLogs (
      ID              INTEGER PRIMARY KEY AUTOINCREMENT,
      First_Name      TEXT    NOT NULL DEFAULT '',
      Last_Name       TEXT    DEFAULT '',
      Job_Title       TEXT    DEFAULT '',
      Mobile_Phone    TEXT    DEFAULT '',
      E_mail_Address  TEXT    DEFAULT '',
      Address         TEXT    DEFAULT '',
      Country_Region  TEXT    DEFAULT 'United Kingdom',
      Caller_Type     TEXT    DEFAULT 'DRIVER',
      Status          TEXT    DEFAULT 'Pending',
      Stage           TEXT    DEFAULT '1 - New Caller',
      Booking         TEXT    DEFAULT '',
      Documentations  TEXT    DEFAULT '',
      Remarks         TEXT    DEFAULT '',
      Notes           TEXT    DEFAULT '',
      Attachments     TEXT    DEFAULT '[]',
      Priority        TEXT    DEFAULT 'Normal',
      Assigned_To     TEXT    DEFAULT '',
      Last_Call_Date  DATE,
      Next_Call_Date  DATE,
      Call_Count      INTEGER DEFAULT 0,
      Created_At      DATETIME DEFAULT CURRENT_TIMESTAMP,
      Updated_At      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS DriverDetails (
      DriverDetailID    INTEGER PRIMARY KEY AUTOINCREMENT,
      CallLogsID        INTEGER NOT NULL UNIQUE,
      DriverName        TEXT    DEFAULT '',
      LicenseNumber     TEXT    DEFAULT '',
      LicenseClass      TEXT    DEFAULT '',
      LicenseIssueDate  DATE,
      LicenseExpiryDate DATE,
      DVLACheck         TEXT    DEFAULT 'Pending',
      DBSCheck          TEXT    DEFAULT 'Pending',
      PCOCheck          TEXT    DEFAULT 'Pending',
      VehicleType       TEXT    DEFAULT '',
      Notes             TEXT    DEFAULT '',
      Created_At        DATETIME DEFAULT CURRENT_TIMESTAMP,
      Updated_At        DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (CallLogsID) REFERENCES CallLogs(ID) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS CallSessions (
      SessionID    INTEGER PRIMARY KEY AUTOINCREMENT,
      CallLogsID   INTEGER NOT NULL,
      Outcome      TEXT    DEFAULT 'No Answer',
      Duration_Min INTEGER DEFAULT 0,
      Notes        TEXT    DEFAULT '',
      Called_By    TEXT    DEFAULT '',
      Called_At    DATETIME DEFAULT CURRENT_TIMESTAMP,
      Next_Action  TEXT    DEFAULT '',
      FOREIGN KEY (CallLogsID) REFERENCES CallLogs(ID) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ActivityLog (
      ActivityID   INTEGER PRIMARY KEY AUTOINCREMENT,
      CallLogsID   INTEGER,
      Action       TEXT    NOT NULL,
      Detail       TEXT    DEFAULT '',
      Entity       TEXT    DEFAULT 'contact',
      Created_By   TEXT    DEFAULT 'System',
      Created_At   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (CallLogsID) REFERENCES CallLogs(ID) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS SystemUsers (
      UserID          INTEGER PRIMARY KEY AUTOINCREMENT,
      Name            TEXT    NOT NULL,
      Email           TEXT    NOT NULL UNIQUE,
      Avatar_URL      TEXT    DEFAULT '',
      Role            TEXT    NOT NULL DEFAULT 'User',
      Password_Salt   TEXT    NOT NULL,
      Password_Hash   TEXT    NOT NULL,
      IsActive        INTEGER NOT NULL DEFAULT 1,
      Last_Login_At   DATETIME,
      Created_At      DATETIME DEFAULT CURRENT_TIMESTAMP,
      Updated_At      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS SystemSessions (
      SessionID         TEXT PRIMARY KEY,
      UserID            INTEGER NOT NULL,
      Is_Online         INTEGER NOT NULL DEFAULT 1,
      IP_Address        TEXT    DEFAULT '',
      Geo_Country       TEXT    DEFAULT '',
      Geo_Region        TEXT    DEFAULT '',
      Geo_City          TEXT    DEFAULT '',
      User_Agent        TEXT    DEFAULT '',
      Last_Seen_At      DATETIME DEFAULT CURRENT_TIMESTAMP,
      Created_At        DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (UserID) REFERENCES SystemUsers(UserID) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS SystemSettings (
      Setting_Key     TEXT PRIMARY KEY,
      Setting_Value   TEXT NOT NULL DEFAULT '',
      Updated_At      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_cl_status      ON CallLogs(Status);
    CREATE INDEX IF NOT EXISTS idx_cl_stage       ON CallLogs(Stage);
    CREATE INDEX IF NOT EXISTS idx_cl_type        ON CallLogs(Caller_Type);
    CREATE INDEX IF NOT EXISTS idx_cl_next_call   ON CallLogs(Next_Call_Date);
    CREATE INDEX IF NOT EXISTS idx_dd_contact     ON DriverDetails(CallLogsID);
    CREATE INDEX IF NOT EXISTS idx_cs_contact     ON CallSessions(CallLogsID);
    CREATE INDEX IF NOT EXISTS idx_activity_time  ON ActivityLog(Created_At);
    CREATE INDEX IF NOT EXISTS idx_system_users_email ON SystemUsers(Email);
    CREATE INDEX IF NOT EXISTS idx_system_sessions_user ON SystemSessions(UserID);
  `);

  const userColumns = database.prepare("PRAGMA table_info(SystemUsers)").all();
  if (!userColumns.some(column => column.name === 'Avatar_URL')) {
    database.prepare("ALTER TABLE SystemUsers ADD COLUMN Avatar_URL TEXT DEFAULT ''").run();
  }

  database.prepare("UPDATE CallLogs SET Booking='1 - New Caller' WHERE Booking='1 - Green'").run();
  database.prepare("UPDATE SystemUsers SET Role='User' WHERE Role='Agent'").run();
  seedSystemSettings();
  database.prepare(`
    UPDATE SystemSettings
    SET Setting_Value = 'Zaya Group Calling System',
        Updated_At = CURRENT_TIMESTAMP
    WHERE Setting_Key = 'systemName'
      AND Setting_Value = 'Zaya Group Calling System ZGC System'
  `).run();
  database.prepare(`
    UPDATE SystemSettings
    SET Setting_Value = ?,
        Updated_At = CURRENT_TIMESTAMP
    WHERE Setting_Key = 'loginImage'
      AND (Setting_Value = '' OR Setting_Value = '/login-visual.jpg?v=20260309-1')
  `).run(DEFAULT_ROTATING_LOGIN_IMAGES.join('\n'));
  database.prepare(`
    UPDATE SystemSettings
    SET Setting_Value = ?,
        Updated_At = CURRENT_TIMESTAMP
    WHERE Setting_Key = 'systemTagline'
      AND (Setting_Value = '' OR Setting_Value = 'Corporate Operations Workspace')
  `).run(DEFAULT_SYSTEM_SETTINGS.systemTagline);
  database.prepare(`
    UPDATE SystemSettings
    SET Setting_Value = ?,
        Updated_At = CURRENT_TIMESTAMP
    WHERE Setting_Key = 'loginHeadline'
      AND (Setting_Value = '' OR Setting_Value = 'Operate one global calling workspace with daily corporate insights.')
  `).run(DEFAULT_SYSTEM_SETTINGS.loginHeadline);
  database.prepare(`
    UPDATE SystemSettings
    SET Setting_Value = ?,
        Updated_At = CURRENT_TIMESTAMP
    WHERE Setting_Key = 'loginCopy'
      AND (Setting_Value = '' OR Setting_Value = 'Every installed Zaya system now presents a synchronized corporate visual and rotating operational facts so teams start from the same message every day.')
  `).run(DEFAULT_SYSTEM_SETTINGS.loginCopy);
  database.prepare(`
    UPDATE SystemSettings
    SET Setting_Value = ?,
        Updated_At = CURRENT_TIMESTAMP
    WHERE Setting_Key = 'quote'
      AND (Setting_Value = '' OR Setting_Value = 'Daily system clarity supports stronger development, growth, and productivity.')
  `).run(DEFAULT_SYSTEM_SETTINGS.quote);
  database.prepare(`
    UPDATE SystemSettings
    SET Setting_Value = ?,
        Updated_At = CURRENT_TIMESTAMP
    WHERE Setting_Key = 'quoteAuthor'
      AND (Setting_Value = '' OR Setting_Value = 'WAS Corporate Systems')
  `).run(DEFAULT_SYSTEM_SETTINGS.quoteAuthor);
  database.prepare(`
    UPDATE SystemSettings
    SET Setting_Value = ?,
        Updated_At = CURRENT_TIMESTAMP
    WHERE Setting_Key = 'facts'
      AND (Setting_Value = '[]' OR Setting_Value = '["Development velocity improves when teams document decisions once and reuse them everywhere.","Consistent follow-up habits drive more growth than last-minute bursts of activity.","Shared dashboards reduce status meetings and increase execution time.","Productivity scales when teams remove duplicate entry and standardize workflows.","Clear ownership shortens delivery cycles and improves operational quality.","Small process improvements compound into major output gains over a quarter.","Growth is easier to sustain when reporting, calling, and compliance stay in one system.","Strong internal tools reduce friction for both managers and frontline teams."]')
  `).run(JSON.stringify(DEFAULT_SYSTEM_SETTINGS.facts));

  const count = database.prepare('SELECT COUNT(*) as c FROM CallLogs').get();
  if (count.c === 0) seedData();
}

function seedSystemSettings() {
  const database = db;
  const upsert = database.prepare(`
    INSERT INTO SystemSettings (Setting_Key, Setting_Value, Updated_At)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(Setting_Key) DO NOTHING
  `);

  Object.entries(DEFAULT_SYSTEM_SETTINGS).forEach(([key, value]) => {
    upsert.run(key, typeof value === 'string' ? value : JSON.stringify(value));
  });
}

function ensureBootstrapAdmin() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL || ROOT_SYSTEM_EMAIL);
  const password = String(process.env.ADMIN_PASSWORD || 'Kingsley06#').trim();
  if (!email || !password) return;

  const database = db;
  const existing = database.prepare('SELECT UserID FROM SystemUsers WHERE Email = ?').get(email);
  const { salt, hash } = createPasswordHash(password);

  if (existing) {
    database.prepare(`
      UPDATE SystemUsers
      SET Name = ?, Role = ?, Password_Salt = ?, Password_Hash = ?, IsActive = 1, Updated_At = CURRENT_TIMESTAMP
      WHERE UserID = ?
    `).run('Zaya Operations', 'Super Admin', salt, hash, existing.UserID);
    return;
  }

  database.prepare(`
    INSERT INTO SystemUsers (Name, Email, Role, Password_Salt, Password_Hash, IsActive)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run('Zaya Operations', email, 'Super Admin', salt, hash);
}

function listSystemUsers() {
  const database = getDb();
  return database.prepare(`
    SELECT su.UserID, su.Name, su.Email, su.Avatar_URL, su.Role, su.IsActive, su.Last_Login_At, su.Created_At, su.Updated_At,
           ss.SessionID, ss.Is_Online AS Session_Is_Online, ss.IP_Address, ss.Geo_Country, ss.Geo_Region, ss.Geo_City,
           ss.User_Agent, ss.Last_Seen_At AS Session_Last_Seen_At
    FROM SystemUsers su
    LEFT JOIN (
      SELECT s1.*
      FROM SystemSessions s1
      INNER JOIN (
        SELECT UserID, MAX(Created_At) AS MaxCreatedAt
        FROM SystemSessions
        GROUP BY UserID
      ) latest
        ON latest.UserID = s1.UserID
       AND latest.MaxCreatedAt = s1.Created_At
    ) ss ON ss.UserID = su.UserID
    ORDER BY
      CASE su.Role
        WHEN 'Super Admin' THEN 0
        WHEN 'Admin' THEN 1
        ELSE 2
      END,
      su.Name COLLATE NOCASE ASC
  `).all().map(serializeUser);
}

function listActiveUserNames() {
  const database = getDb();
  return database.prepare(`
    SELECT Name
    FROM SystemUsers
    WHERE IsActive = 1
    ORDER BY Name COLLATE NOCASE ASC
  `).all().map(row => row.Name);
}

function createSystemUser({ name, email, role = 'User', password, isActive = true }) {
  const normalizedEmail = normalizeEmail(email);
  if (!name || !normalizedEmail || !password) {
    throw new Error('Name, email, and password are required.');
  }
  const normalizedRole = normalizeSystemRole(role);

  const database = getDb();
  const existing = database.prepare('SELECT UserID FROM SystemUsers WHERE Email = ?').get(normalizedEmail);
  if (existing) {
    throw new Error('A user with this email already exists.');
  }

  const { salt, hash } = createPasswordHash(password);
  const result = database.prepare(`
    INSERT INTO SystemUsers (Name, Email, Role, Password_Salt, Password_Hash, IsActive)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(String(name).trim(), normalizedEmail, normalizedRole, salt, hash, isActive ? 1 : 0);

  return getSystemUserById(result.lastInsertRowid);
}

function getSystemUserById(userId) {
  const database = getDb();
  const row = database.prepare(`
    SELECT UserID, Name, Email, Avatar_URL, Role, IsActive, Last_Login_At, Created_At, Updated_At
    FROM SystemUsers
    WHERE UserID = ?
  `).get(userId);
  return serializeUser(row);
}

function updateSystemUser(userId, { name, role, isActive }) {
  const database = getDb();
  const existing = getSystemUserById(userId);
  if (!existing) {
    throw new Error('User not found.');
  }
  if (isProtectedSystemEmail(existing.email)) {
    throw new Error('The primary super admin account cannot be edited here.');
  }

  database.prepare(`
    UPDATE SystemUsers
    SET Name = ?, Role = ?, IsActive = ?, Updated_At = CURRENT_TIMESTAMP
    WHERE UserID = ?
  `).run(
    String(name || existing.name).trim(),
    normalizeSystemRole(role, existing.role || 'User'),
    isActive === undefined ? (existing.isActive ? 1 : 0) : (isActive ? 1 : 0),
    userId
  );

  return getSystemUserById(userId);
}

function setSystemUserPassword(userId, password) {
  if (!password) {
    throw new Error('Password is required.');
  }

  const existing = getSystemUserById(userId);
  if (!existing) {
    throw new Error('User not found.');
  }
  if (isProtectedSystemEmail(existing.email)) {
    throw new Error('The primary super admin password can only be changed by that account.');
  }

  const database = getDb();
  const { salt, hash } = createPasswordHash(password);
  database.prepare(`
    UPDATE SystemUsers
    SET Password_Salt = ?, Password_Hash = ?, Updated_At = CURRENT_TIMESTAMP
    WHERE UserID = ?
  `).run(salt, hash, userId);

  return getSystemUserById(userId);
}

function authenticateSystemUser(email, password) {
  const normalizedEmail = normalizeEmail(email);
  const database = getDb();
  const row = database.prepare('SELECT * FROM SystemUsers WHERE Email = ?').get(normalizedEmail);
  if (!row || !row.IsActive || !verifyPassword(password, row.Password_Salt, row.Password_Hash)) {
    return null;
  }

  database.prepare('UPDATE SystemUsers SET Last_Login_At = CURRENT_TIMESTAMP WHERE UserID = ?').run(row.UserID);
  return getSystemUserById(row.UserID);
}

function getSystemSettings() {
  const database = getDb();
  const rows = database.prepare(`
    SELECT Setting_Key, Setting_Value
    FROM SystemSettings
    ORDER BY Setting_Key ASC
  `).all();

  const settings = { ...DEFAULT_SYSTEM_SETTINGS };
  rows.forEach(row => {
    if (row.Setting_Key === 'facts') {
      try {
        settings.facts = JSON.parse(row.Setting_Value || '[]');
      } catch (_) {
        settings.facts = [];
      }
      return;
    }

    settings[row.Setting_Key] = row.Setting_Value;
  });

  return settings;
}

function updateSystemSettings(patch = {}) {
  const database = getDb();
  const upsert = database.prepare(`
    INSERT INTO SystemSettings (Setting_Key, Setting_Value, Updated_At)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(Setting_Key) DO UPDATE SET
      Setting_Value = excluded.Setting_Value,
      Updated_At = CURRENT_TIMESTAMP
  `);

  Object.keys(DEFAULT_SYSTEM_SETTINGS).forEach(key => {
    if (!(key in patch)) return;
    const value = key === 'facts'
      ? JSON.stringify(Array.isArray(patch[key]) ? patch[key].map(item => String(item).trim()).filter(Boolean) : [])
      : String(patch[key] || '').trim();
    upsert.run(key, value);
  });

  return getSystemSettings();
}

function updateOwnProfile(userId, { name, avatarUrl } = {}) {
  const existing = getSystemUserById(userId);
  if (!existing) {
    throw new Error('User not found.');
  }

  const nextName = String(name || '').trim();
  if (!nextName) {
    throw new Error('Name is required.');
  }

  const database = getDb();
  database.prepare(`
    UPDATE SystemUsers
    SET Name = ?, Avatar_URL = ?, Updated_At = CURRENT_TIMESTAMP
    WHERE UserID = ?
  `).run(nextName, String(avatarUrl || '').trim(), userId);

  return getSystemUserById(userId);
}

function changeOwnPassword(userId, currentPassword, nextPassword) {
  const database = getDb();
  const row = database.prepare(`
    SELECT UserID, Password_Salt, Password_Hash
    FROM SystemUsers
    WHERE UserID = ?
  `).get(userId);

  if (!row) {
    throw new Error('User not found.');
  }
  if (!verifyPassword(currentPassword, row.Password_Salt, row.Password_Hash)) {
    throw new Error('Current password is incorrect.');
  }
  if (!String(nextPassword || '').trim()) {
    throw new Error('New password is required.');
  }

  const { salt, hash } = createPasswordHash(nextPassword);
  database.prepare(`
    UPDATE SystemUsers
    SET Password_Salt = ?, Password_Hash = ?, Updated_At = CURRENT_TIMESTAMP
    WHERE UserID = ?
  `).run(salt, hash, userId);

  return getSystemUserById(userId);
}

function createSystemSession(userId, context = {}) {
  const database = getDb();
  const sessionId = crypto.randomUUID();
  const geoCountry = String(context.geoCountry || '').trim();
  const geoRegion = String(context.geoRegion || '').trim();
  const geoCity = String(context.geoCity || '').trim();
  const ipAddress = String(context.ipAddress || '').trim();
  const userAgent = String(context.userAgent || '').trim();

  database.prepare(`
    INSERT INTO SystemSessions (SessionID, UserID, Is_Online, IP_Address, Geo_Country, Geo_Region, Geo_City, User_Agent)
    VALUES (?, ?, 1, ?, ?, ?, ?, ?)
  `).run(sessionId, userId, ipAddress, geoCountry, geoRegion, geoCity, userAgent);

  return getSystemSession(sessionId);
}

function getSystemSession(sessionId) {
  const database = getDb();
  const row = database.prepare(`
    SELECT ss.*, su.Name, su.Email, su.Avatar_URL, su.Role
    FROM SystemSessions ss
    JOIN SystemUsers su ON su.UserID = ss.UserID
    WHERE ss.SessionID = ?
  `).get(sessionId);

  if (!row) return null;

  return {
    sessionId: row.SessionID,
    userId: row.UserID,
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
}

function touchSystemSession(sessionId, context = {}) {
  const database = getDb();
  const existing = getSystemSession(sessionId);
  if (!existing) {
    throw new Error('Session not found.');
  }

  database.prepare(`
    UPDATE SystemSessions
    SET Is_Online = 1,
        IP_Address = COALESCE(NULLIF(?, ''), IP_Address),
        Geo_Country = COALESCE(NULLIF(?, ''), Geo_Country),
        Geo_Region = COALESCE(NULLIF(?, ''), Geo_Region),
        Geo_City = COALESCE(NULLIF(?, ''), Geo_City),
        User_Agent = COALESCE(NULLIF(?, ''), User_Agent),
        Last_Seen_At = CURRENT_TIMESTAMP
    WHERE SessionID = ?
  `).run(
    String(context.ipAddress || '').trim(),
    String(context.geoCountry || '').trim(),
    String(context.geoRegion || '').trim(),
    String(context.geoCity || '').trim(),
    String(context.userAgent || '').trim(),
    sessionId
  );

  return getSystemSession(sessionId);
}

function closeSystemSession(sessionId) {
  const database = getDb();
  database.prepare(`
    UPDATE SystemSessions
    SET Is_Online = 0,
        Last_Seen_At = CURRENT_TIMESTAMP
    WHERE SessionID = ?
  `).run(sessionId);
}

function listLiveSystemUsers() {
  const database = getDb();
  return database.prepare(`
    SELECT ss.*, su.Name, su.Email, su.Avatar_URL, su.Role
    FROM SystemSessions ss
    JOIN SystemUsers su ON su.UserID = ss.UserID
    WHERE ss.Is_Online = 1
      AND ss.Last_Seen_At >= datetime('now', '-10 minutes')
    ORDER BY ss.Last_Seen_At DESC
  `).all().map(row => ({
    sessionId: row.SessionID,
    userId: row.UserID,
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
}

function runMaintenanceAction(action) {
  const database = getDb();
  const normalizedAction = String(action || '').trim();

  if (normalizedAction === 'vacuum') {
    database.exec('VACUUM');
    return { action: normalizedAction, message: 'Database vacuum completed.' };
  }
  if (normalizedAction === 'checkpoint') {
    if (!process.env.VERCEL) {
      database.pragma('wal_checkpoint(TRUNCATE)');
    }
    return { action: normalizedAction, message: 'WAL checkpoint completed.' };
  }
  if (normalizedAction === 'clear-offline-sessions') {
    const result = database.prepare(`
      DELETE FROM SystemSessions
      WHERE Is_Online = 0
         OR Last_Seen_At < datetime('now', '-7 days')
    `).run();
    return { action: normalizedAction, message: `Removed ${result.changes || 0} offline session(s).` };
  }

  throw new Error('Unknown maintenance action.');
}

function getBackupMetadata(filePath) {
  const stats = fs.statSync(filePath);
  const name = path.basename(filePath);
  const normalized = name.toLowerCase();
  let type = 'manual';
  if (normalized.includes('-auto-')) type = 'auto';
  if (normalized.includes('-pre-restore-')) type = 'pre-restore';
  if (normalized.includes('-recovery-')) type = 'recovery';

  return {
    name,
    type,
    size: stats.size,
    createdAt: stats.birthtime.toISOString(),
    updatedAt: stats.mtime.toISOString(),
  };
}

function listBackups() {
  const { backupsDir } = ensureStorageDirs();
  return fs.readdirSync(backupsDir)
    .filter(name => name.toLowerCase().endsWith('.db'))
    .map(name => path.join(backupsDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    .map(getBackupMetadata);
}

function pruneBackups({ type = 'auto', keep = 14 } = {}) {
  const { backupsDir } = ensureStorageDirs();
  const matching = fs.readdirSync(backupsDir)
    .filter(name => name.toLowerCase().endsWith('.db'))
    .map(name => path.join(backupsDir, name))
    .filter(filePath => path.basename(filePath).toLowerCase().includes(`-${type.toLowerCase()}-`))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  matching.slice(keep).forEach(filePath => {
    fs.rmSync(filePath, { force: true });
  });
}

async function createBackup({ type = 'manual', label = '' } = {}) {
  const database = getDb();
  const { backupsDir } = ensureStorageDirs();
  const safeLabel = sanitizeBackupLabel(label);
  const filename = `${getTimestamp()}-${type}${safeLabel ? `-${safeLabel}` : ''}.db`;
  const targetPath = path.join(backupsDir, filename);

  if (!process.env.VERCEL) {
    database.pragma('wal_checkpoint(TRUNCATE)');
  }
  await database.backup(targetPath);

  if (type === 'auto') {
    pruneBackups({ type: 'auto', keep: 14 });
  }

  return getBackupMetadata(targetPath);
}

async function restoreBackup(backupName) {
  const { backupsDir, dbPath } = ensureStorageDirs();
  const safeName = path.basename(String(backupName || ''));
  const backupPath = path.join(backupsDir, safeName);
  if (!safeName || !fs.existsSync(backupPath)) {
    throw new Error('Backup file not found.');
  }

  await createBackup({ type: 'pre-restore', label: 'safety-copy' });

  closeDb();
  fs.rmSync(`${dbPath}-wal`, { force: true });
  fs.rmSync(`${dbPath}-shm`, { force: true });
  fs.copyFileSync(backupPath, dbPath);

  const restoredDb = getDb();
  if (!process.env.VERCEL) {
    restoredDb.pragma('wal_checkpoint(TRUNCATE)');
  }

  return {
    restored: getBackupMetadata(backupPath),
    currentUsers: listSystemUsers().length,
  };
}

function seedData() {
  const ic = db.prepare(`
    INSERT INTO CallLogs
      (First_Name,Last_Name,Job_Title,Mobile_Phone,E_mail_Address,Address,
       Country_Region,Caller_Type,Status,Stage,Booking,Remarks,Notes,Priority,
       Assigned_To,Call_Count,Last_Call_Date,Next_Call_Date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const id = db.prepare(`
    INSERT INTO DriverDetails
      (CallLogsID,DriverName,LicenseNumber,LicenseClass,LicenseIssueDate,LicenseExpiryDate,DVLACheck,DBSCheck,PCOCheck,VehicleType)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `);
  const ics = db.prepare(`
    INSERT INTO CallSessions (CallLogsID,Outcome,Duration_Min,Notes,Called_By,Called_At,Next_Action)
    VALUES (?,?,?,?,?,?,?)
  `);
  const ia = db.prepare(`
    INSERT INTO ActivityLog (CallLogsID,Action,Detail,Entity,Created_By)
    VALUES (?,?,?,?,?)
  `);

  db.transaction(() => {
    const c1 = ic.run('Scott', 'Alisson', 'Driver', '0785550262', 'alie.scoty@gmail.com', '21 Bleeker Street, London', 'United Kingdom', 'DRIVER', 'Approved', '2 - Training', '1 - New Caller', 'Completed first week of training. Very responsive.', 'Night shift preferred. Has own vehicle.', 'High', 'Sarah', 3, '2025-01-14', '2025-01-21');
    id.run(c1.lastInsertRowid, 'Scott Alisson', 'DVLA-2020-0312', 'Class C', '2020-03-15', '2027-03-15', 'Approved', 'Approved', 'Pending', 'Van');
    ics.run(c1.lastInsertRowid, 'Successful', 12, 'Discussed training schedule. Starting Monday.', 'Sarah', '2025-01-14 10:30:00', 'Send training docs');
    ics.run(c1.lastInsertRowid, 'Successful', 8, 'Follow-up. Confirmed start date.', 'Sarah', '2025-01-10 14:00:00', 'Book induction');
    ia.run(c1.lastInsertRowid, 'Contact Created', 'New driver contact added', 'contact', 'System');
    ia.run(c1.lastInsertRowid, 'Status Changed', 'Status set to Approved', 'contact', 'Sarah');

    const c2 = ic.run('William', 'King', 'Operations Manager', '07701012345', 'william.king@outlook.com', '20 Church Lane, Birmingham', 'United Kingdom', 'MANAGER', 'Approved', '2 - Training', '1 - New Caller', 'Strong candidate. Previous logistics experience.', 'Available full-time. Salary expectation: 35000 GBP.', 'High', 'Mike', 2, '2025-01-13', '2025-01-20');
    ia.run(c2.lastInsertRowid, 'Contact Created', 'New manager contact added', 'contact', 'System');
    ia.run(c2.lastInsertRowid, 'Stage Changed', 'Stage moved to 2 - Training', 'contact', 'Mike');

    const c3 = ic.run('Harry', 'Wilson', 'Driver', '0535654243', 'harry.wilson@gmail.com', '3 Cambridge Road, Cambridge', 'United Kingdom', 'DRIVER', 'Pending', '1 - Interview', '2 - Callbacks', 'Called twice. Left voicemail.', 'DBS check pending. Awaiting documents.', 'Normal', 'Sarah', 2, '2025-01-12', '2025-01-19');
    id.run(c3.lastInsertRowid, 'Harry Wilson', 'DVLA-2019-0601', 'Class B', '2019-06-01', '2025-06-01', 'Pending', 'Pending', 'Pending', 'Car');
    ics.run(c3.lastInsertRowid, 'No Answer', 0, 'Left voicemail', 'Sarah', '2025-01-12 09:00:00', 'Call again tomorrow');
    ia.run(c3.lastInsertRowid, 'Contact Created', 'New driver contact added', 'contact', 'System');
    ia.run(c3.lastInsertRowid, 'Call Logged', 'No Answer - left voicemail', 'call', 'Sarah');

    const c4 = ic.run('Emily', 'Clarke', 'Receptionist', '07891234567', 'emily.clarke@gmail.com', '15 High Street, London', 'United Kingdom', 'RECEPTIONIST', 'Pending', '1 - Interview', null, 'Phone interview completed. Strong communication.', 'Immediate availability. Part-time considered.', 'Normal', 'Mike', 1, '2025-01-11', '2025-01-18');
    ics.run(c4.lastInsertRowid, 'Successful', 25, 'Phone interview. Very professional.', 'Mike', '2025-01-11 11:00:00', 'Schedule in-person interview');
    ia.run(c4.lastInsertRowid, 'Contact Created', 'New receptionist contact added', 'contact', 'System');

    const c5 = ic.run('Omar', 'Issa', 'Driver', '0535654222', 'omar.issa@gmail.com', 'East London', 'United Kingdom', 'DRIVER', 'Approved', '2 - Training', '1 - New Caller', 'Training progressing well.', 'Night shift. Has TfL licence.', 'High', 'Sarah', 4, '2025-01-15', '2025-01-22');
    id.run(c5.lastInsertRowid, 'Omar Issa', 'DVLA-2021-0110', 'Class C', '2021-01-10', '2027-01-10', 'Approved', 'Approved', 'Approved', 'Minibus');
    ics.run(c5.lastInsertRowid, 'Successful', 15, 'Completed induction. Passed theory test.', 'Sarah', '2025-01-15 16:00:00', 'Book practical assessment');
    ia.run(c5.lastInsertRowid, 'Contact Created', 'New driver contact added', 'contact', 'System');
    ia.run(c5.lastInsertRowid, 'Compliance Updated', 'PCO check Approved', 'driver', 'Sarah');

    const c6 = ic.run('Seif', 'Hassan', 'Accountant', '07712345678', 'seif.hassan@email.com', 'Manchester', 'United Kingdom', 'ACCOUNTANT', 'Pending', '1 - Interview', null, 'CV received. Strong Excel skills.', 'AAT qualified. 5 years experience.', 'Normal', 'Mike', 1, '2025-01-10', '2025-01-17');
    ia.run(c6.lastInsertRowid, 'Contact Created', 'New accountant contact added', 'contact', 'System');

    const c7 = ic.run('Amelia', 'King', 'Driver', '07934567890', 'amelia.king@gmail.com', 'Leeds, Yorkshire', 'United Kingdom', 'DRIVER', 'Pending', '1 - New Caller', null, 'Initial enquiry from job board.', 'Newly qualified. Clean licence.', 'Low', 'Sarah', 0, null, '2025-01-16');
    id.run(c7.lastInsertRowid, 'Amelia King', 'DVLA-2024-0701', 'Class B', '2024-07-01', '2029-07-01', 'Pending', 'Pending', 'Pending', 'Car');
    ia.run(c7.lastInsertRowid, 'Contact Created', 'New driver contact added', 'contact', 'System');

    const c8 = ic.run('James', 'Roberts', 'Driver', '07855432100', 'james.roberts@outlook.com', 'Bristol', 'United Kingdom', 'DRIVER', 'Approved', '3 - Booked', '1 - New Caller', 'All checks complete. Ready to start.', 'Experienced TfL driver. Excellent references.', 'High', 'Sarah', 5, '2025-01-15', '2025-01-23');
    id.run(c8.lastInsertRowid, 'James Roberts', 'DVLA-2018-0315', 'Class C+E', '2018-03-15', '2026-03-15', 'Approved', 'Approved', 'Approved', 'HGV');
    ia.run(c8.lastInsertRowid, 'Contact Created', 'Driver contact added', 'contact', 'System');
    ia.run(c8.lastInsertRowid, 'Stage Changed', 'Stage moved to 3 - Booked', 'contact', 'Sarah');
    ia.run(c8.lastInsertRowid, 'Booking Confirmed', 'Booking set to 1 - New Caller', 'contact', 'Sarah');
  })();
}

module.exports = {
  authenticateSystemUser,
  changeOwnPassword,
  closeDb,
  closeSystemSession,
  createBackup,
  createSystemSession,
  createSystemUser,
  getSystemSession,
  getSystemSettings,
  getDb,
  getStoragePaths,
  listActiveUserNames,
  listBackups,
  listLiveSystemUsers,
  listSystemUsers,
  restoreBackup,
  runMaintenanceAction,
  setSystemUserPassword,
  touchSystemSession,
  updateOwnProfile,
  updateSystemSettings,
  updateSystemUser,
};
