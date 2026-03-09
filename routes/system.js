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

const router = express.Router();

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

router.post('/login', (req, res) => {
  try {
    const user = authenticateSystemUser(req.body?.email, req.body?.password);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }
    const session = createSystemSession(user.id, getRequestContext(req));
    return res.json({ success: true, data: { ...user, sessionId: session.sessionId } });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/users', (req, res) => {
  try {
    requireSystemRole(req, ['Super Admin', 'Admin']);
    res.json({ success: true, data: listSystemUsers() });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.get('/users/active', (req, res) => {
  try {
    requireSystemSession(req);
    res.json({ success: true, data: listActiveUserNames() });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.post('/users', (req, res) => {
  try {
    const requester = requireSystemRole(req, ['Super Admin', 'Admin']);
    const payload = { ...(req.body || {}) };
    if (requester.role !== 'Super Admin' && payload.role !== 'User') {
      return res.status(403).json({ success: false, error: 'Only the super admin can create admin accounts.' });
    }
    const user = createSystemUser(payload);
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.get('/users/live', (req, res) => {
  try {
    requireSystemRole(req, ['Super Admin']);
    res.json({ success: true, data: listLiveSystemUsers() });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.patch('/users/:id', (req, res) => {
  try {
    const requester = requireSystemRole(req, ['Super Admin', 'Admin']);
    const existingUsers = listSystemUsers();
    const targetUser = existingUsers.find(user => user.id === Number(req.params.id));
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    if (requester.role !== 'Super Admin' && targetUser.role !== 'User') {
      return res.status(403).json({ success: false, error: 'Only the super admin can update admin accounts.' });
    }
    if (requester.role !== 'Super Admin' && req.body?.role && req.body.role !== 'User') {
      return res.status(403).json({ success: false, error: 'Only the super admin can assign admin roles.' });
    }
    const user = updateSystemUser(Number(req.params.id), req.body || {});
    res.json({ success: true, data: user });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    res.status(error.status || status).json({ success: false, error: error.message });
  }
});

router.post('/users/:id/password', (req, res) => {
  try {
    const requester = requireSystemRole(req, ['Super Admin', 'Admin']);
    const existingUsers = listSystemUsers();
    const targetUser = existingUsers.find(user => user.id === Number(req.params.id));
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    if (requester.role !== 'Super Admin' && targetUser.role !== 'User') {
      return res.status(403).json({ success: false, error: 'Only the super admin can reset admin passwords.' });
    }
    const user = setSystemUserPassword(Number(req.params.id), req.body?.password);
    res.json({ success: true, data: user });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    res.status(error.status || status).json({ success: false, error: error.message });
  }
});

router.get('/profile', (req, res) => {
  try {
    const session = requireSystemSession(req);
    const users = listSystemUsers();
    const user = users.find(item => item.id === session.userId);
    res.json({ success: true, data: user || null });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.patch('/profile', (req, res) => {
  try {
    const session = requireSystemSession(req);
    const user = updateOwnProfile(session.userId, req.body || {});
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.post('/profile/password', (req, res) => {
  try {
    const session = requireSystemSession(req);
    const user = changeOwnPassword(session.userId, req.body?.currentPassword, req.body?.nextPassword);
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.get('/settings', (req, res) => {
  try {
    res.json({ success: true, data: getSystemSettings() });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.patch('/settings', (req, res) => {
  try {
    requireSystemRole(req, ['Super Admin', 'Admin']);
    res.json({ success: true, data: updateSystemSettings(req.body || {}) });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.get('/backups', (req, res) => {
  try {
    requireSystemRole(req, ['Super Admin', 'Admin']);
    res.json({ success: true, data: listBackups() });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.post('/backups', async (req, res) => {
  try {
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
    requireSystemRole(req, ['Super Admin', 'Admin']);
    const restored = await restoreBackup(req.body?.backupName);
    res.json({ success: true, data: restored });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    res.status(error.status || status).json({ success: false, error: error.message });
  }
});

router.post('/session/heartbeat', (req, res) => {
  try {
    const session = touchSystemSession(req.body?.sessionId, getRequestContext(req));
    res.json({ success: true, data: session });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

router.post('/session/logout', (req, res) => {
  try {
    closeSystemSession(req.body?.sessionId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/status', (req, res) => {
  try {
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
    requireSystemRole(req, ['Super Admin', 'Admin']);
    const result = runMaintenanceAction(req.body?.action);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

module.exports = router;
