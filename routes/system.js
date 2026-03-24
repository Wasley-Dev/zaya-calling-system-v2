const express = require('express');
const {
  authenticateSystemUser,
  changeOwnPassword,
  closeSystemSession,
  createBackup,
  createSystemSession,
  createSystemUser,
  getSystemSession,
  getSystemSettings,
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
} = require('../db/database');
const pg = require('../db/pg');

const router = express.Router();
const ROOT_SYSTEM_EMAIL = 'it@zayagroupltd.com';

function getRequestContext(req) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ipAddress = forwardedFor
    || String(req.headers['x-real-ip'] || '').trim()
    || req.ip
    || req.socket?.remoteAddress
    || '';

  return {
    ipAddress: String(ipAddress).replace(/^::ffff:/, ''),
    geoCountry: String(req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '').trim(),
    geoRegion: String(req.headers['x-vercel-ip-country-region'] || req.headers['x-vercel-ip-region'] || '').trim(),
    geoCity: String(req.headers['x-vercel-ip-city'] || req.headers['cf-ipcity'] || '').trim(),
    userAgent: String(req.headers['user-agent'] || '').trim(),
  };
}

function getSessionIdFromRequest(req) {
  return String(req.headers['x-system-session-id'] || req.body?.sessionId || '').trim();
}

function requireSystemSession(req) {
  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) {
    const error = new Error('Authentication required.');
    error.status = 401;
    throw error;
  }

  const session = getSystemSession(sessionId);
  if (!session?.isOnline) {
    const error = new Error('Session expired. Please log in again.');
    error.status = 401;
    throw error;
  }

  return session;
}

function requireSystemRole(req, allowedRoles) {
  const session = requireSystemSession(req);
  if (!allowedRoles.includes(session.role)) {
    const error = new Error('You do not have permission to perform this action.');
    error.status = 403;
    throw error;
  }
  return session;
}

async function requireSystemSessionAsync(req) {
  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) {
    const error = new Error('Authentication required.');
    error.status = 401;
    throw error;
  }

  const session = await pg.getSystemSession(sessionId);
  if (!session?.isOnline) {
    const error = new Error('Session expired. Please log in again.');
    error.status = 401;
    throw error;
  }

  return session;
}

async function requireSystemRoleAsync(req, allowedRoles) {
  const session = await requireSystemSessionAsync(req);
  if (!allowedRoles.includes(session.role)) {
    const error = new Error('You do not have permission to perform this action.');
    error.status = 403;
    throw error;
  }
  return session;
}

router.post('/login', async (req, res) => {
  try {
    const user = pg.isPgEnabled()
      ? await pg.authenticateSystemUser(req.body?.email, req.body?.password)
      : authenticateSystemUser(req.body?.email, req.body?.password);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }
    const session = pg.isPgEnabled()
      ? await pg.createSystemSession(user.id, getRequestContext(req))
      : createSystemSession(user.id, getRequestContext(req));
    return res.json({ success: true, data: { ...user, sessionId: session.sessionId } });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    if (pg.isPgEnabled()) await requireSystemRoleAsync(req, ['Super Admin', 'Admin']);
    else requireSystemRole(req, ['Super Admin', 'Admin']);
    const users = pg.isPgEnabled() ? await pg.listSystemUsers() : listSystemUsers();
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.get('/users/active', async (req, res) => {
  try {
    if (pg.isPgEnabled()) await requireSystemSessionAsync(req);
    else requireSystemSession(req);
    const names = pg.isPgEnabled() ? await pg.listActiveUserNames() : listActiveUserNames();
    res.json({ success: true, data: names });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.post('/users', async (req, res) => {
  try {
    const requester = pg.isPgEnabled()
      ? await requireSystemRoleAsync(req, ['Super Admin', 'Admin'])
      : requireSystemRole(req, ['Super Admin', 'Admin']);
    const payload = { ...(req.body || {}) };
    if (requester.role !== 'Super Admin' && payload.role === 'Super Admin') {
      return res.status(403).json({ success: false, error: 'Only the super admin can create super admin accounts.' });
    }
    const user = pg.isPgEnabled() ? await pg.createSystemUser(payload) : createSystemUser(payload);
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.get('/users/live', async (req, res) => {
  try {
    if (pg.isPgEnabled()) await requireSystemRoleAsync(req, ['Super Admin']);
    else requireSystemRole(req, ['Super Admin']);
    const live = pg.isPgEnabled() ? await pg.listLiveSystemUsers() : listLiveSystemUsers();
    res.json({ success: true, data: live });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.patch('/users/:id', async (req, res) => {
  try {
    const requester = pg.isPgEnabled()
      ? await requireSystemRoleAsync(req, ['Super Admin', 'Admin'])
      : requireSystemRole(req, ['Super Admin', 'Admin']);
    const existingUsers = pg.isPgEnabled() ? await pg.listSystemUsers() : listSystemUsers();
    const targetUser = existingUsers.find(user => user.id === Number(req.params.id));
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    if (targetUser.email === ROOT_SYSTEM_EMAIL) {
      return res.status(403).json({ success: false, error: 'The primary super admin account cannot be edited by another user.' });
    }
    if (requester.role !== 'Super Admin' && targetUser.role === 'Super Admin') {
      return res.status(403).json({ success: false, error: 'Only the super admin can update super admin accounts.' });
    }
    if (requester.role !== 'Super Admin' && req.body?.role === 'Super Admin') {
      return res.status(403).json({ success: false, error: 'Only the super admin can assign super admin roles.' });
    }
    const user = pg.isPgEnabled()
      ? await pg.updateSystemUser(Number(req.params.id), req.body || {})
      : updateSystemUser(Number(req.params.id), req.body || {});
    res.json({ success: true, data: user });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    res.status(error.status || status).json({ success: false, error: error.message });
  }
});

router.post('/users/:id/password', async (req, res) => {
  try {
    const requester = pg.isPgEnabled()
      ? await requireSystemRoleAsync(req, ['Super Admin', 'Admin'])
      : requireSystemRole(req, ['Super Admin', 'Admin']);
    const existingUsers = pg.isPgEnabled() ? await pg.listSystemUsers() : listSystemUsers();
    const targetUser = existingUsers.find(user => user.id === Number(req.params.id));
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    if (targetUser.email === ROOT_SYSTEM_EMAIL) {
      return res.status(403).json({ success: false, error: 'The primary super admin password must be changed by that account.' });
    }
    if (requester.role !== 'Super Admin' && targetUser.role === 'Super Admin') {
      return res.status(403).json({ success: false, error: 'Only the super admin can reset super admin passwords.' });
    }
    const user = pg.isPgEnabled()
      ? await pg.setSystemUserPassword(Number(req.params.id), req.body?.password)
      : setSystemUserPassword(Number(req.params.id), req.body?.password);
    res.json({ success: true, data: user });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    res.status(error.status || status).json({ success: false, error: error.message });
  }
});

router.get('/profile', async (req, res) => {
  try {
    const session = pg.isPgEnabled() ? await requireSystemSessionAsync(req) : requireSystemSession(req);
    const users = pg.isPgEnabled() ? await pg.listSystemUsers() : listSystemUsers();
    const user = users.find(item => item.id === session.userId);
    res.json({ success: true, data: user || null });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.patch('/profile', async (req, res) => {
  try {
    const session = pg.isPgEnabled() ? await requireSystemSessionAsync(req) : requireSystemSession(req);
    const user = pg.isPgEnabled()
      ? await pg.updateOwnProfile(session.userId, req.body || {})
      : updateOwnProfile(session.userId, req.body || {});
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.post('/profile/password', async (req, res) => {
  try {
    const session = pg.isPgEnabled() ? await requireSystemSessionAsync(req) : requireSystemSession(req);
    const user = pg.isPgEnabled()
      ? await pg.changeOwnPassword(session.userId, req.body?.currentPassword, req.body?.nextPassword)
      : changeOwnPassword(session.userId, req.body?.currentPassword, req.body?.nextPassword);
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.get('/settings', async (req, res) => {
  try {
    const settings = pg.isPgEnabled() ? await pg.getSystemSettings() : getSystemSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.patch('/settings', async (req, res) => {
  try {
    if (pg.isPgEnabled()) await requireSystemRoleAsync(req, ['Super Admin', 'Admin']);
    else requireSystemRole(req, ['Super Admin', 'Admin']);
    const updated = pg.isPgEnabled() ? await pg.updateSystemSettings(req.body || {}) : updateSystemSettings(req.body || {});
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.get('/backups', async (req, res) => {
  try {
    if (pg.isPgEnabled()) {
      await requireSystemRoleAsync(req, ['Super Admin', 'Admin']);
      const data = await pg.listSystemBackups();
      return res.json({ success: true, data });
    }
    requireSystemRole(req, ['Super Admin', 'Admin']);
    res.json({ success: true, data: listBackups() });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.post('/backups', async (req, res) => {
  try {
    if (pg.isPgEnabled()) {
      const requester = await requireSystemRoleAsync(req, ['Super Admin', 'Admin']);
      const backup = await pg.createSystemBackup({
        type: req.body?.type || 'manual',
        label: req.body?.label || requester.name || '',
      });
      return res.status(201).json({ success: true, data: backup });
    }
    const requester = requireSystemRole(req, ['Super Admin', 'Admin']);
    const backup = await createBackup({
      type: req.body?.type || 'manual',
      label: req.body?.label || requester.name || '',
    });
    res.status(201).json({ success: true, data: backup });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.post('/recovery/restore', async (req, res) => {
  try {
    if (pg.isPgEnabled()) {
      await requireSystemRoleAsync(req, ['Super Admin']);
      const restored = await pg.restoreSystemBackup(req.body?.backupName);
      return res.json({ success: true, data: restored });
    }
    requireSystemRole(req, ['Super Admin', 'Admin']);
    const restored = await restoreBackup(req.body?.backupName);
    res.json({ success: true, data: restored });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    res.status(error.status || status).json({ success: false, error: error.message });
  }
});

router.post('/session/heartbeat', async (req, res) => {
  try {
    const session = pg.isPgEnabled()
      ? await pg.touchSystemSession(req.body?.sessionId, getRequestContext(req))
      : touchSystemSession(req.body?.sessionId, getRequestContext(req));
    res.json({ success: true, data: session });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

router.post('/session/logout', async (req, res) => {
  try {
    if (pg.isPgEnabled()) await pg.closeSystemSession(req.body?.sessionId);
    else closeSystemSession(req.body?.sessionId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/status', (req, res) => {
  try {
    if (pg.isPgEnabled()) {
      requireSystemRoleAsync(req, ['Super Admin', 'Admin'])
        .then(() => pg.listSystemBackups())
        .then(backups => res.json({
          success: true,
          data: {
            backupIntervalHours: 0,
            dbPath: 'postgres',
            backupsDir: 'n/a',
            backupCount: backups.length,
          },
        }))
        .catch(error => res.status(error.status || 500).json({ success: false, error: error.message }));
      return;
    }
    requireSystemRole(req, ['Super Admin', 'Admin']);
    const { backupsDir, dbPath } = getStoragePaths();
    res.json({
      success: true,
      data: {
        backupIntervalHours: 6,
        dbPath,
        backupsDir,
        backupCount: listBackups().length,
      },
    });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.post('/maintenance', (req, res) => {
  try {
    if (pg.isPgEnabled()) {
      const action = String(req.body?.action || '').trim();
      if (action === 'purge-demo-data') {
        requireSystemRoleAsync(req, ['Super Admin'])
          .then(() => pg.runMaintenanceActionPg(action))
          .then(result => res.json({ success: true, data: result }))
          .catch(error => res.status(error.status || 400).json({ success: false, error: error.message }));
        return;
      }
      return res.status(501).json({ success: false, error: 'Maintenance actions are not supported on Postgres deployments.' });
    }
    const action = String(req.body?.action || '').trim();
    if (action === 'purge-demo-data') {
      requireSystemRole(req, ['Super Admin']);
    } else {
      requireSystemRole(req, ['Super Admin', 'Admin']);
    }
    const result = runMaintenanceAction(action);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

module.exports = router;
