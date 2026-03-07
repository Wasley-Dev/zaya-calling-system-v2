require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const { getRuntimePaths } = require('./paths');
const { createBackup } = require('./db/database');
const pkg = require('./package.json');

let cachedApp = null;
let cachedKey = null;
let autoBackupTimer = null;
const serverStartedAt = new Date().toISOString();

function getReleaseMetadata() {
  return {
    version: pkg.version,
    releaseId: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || serverStartedAt,
    builtAt: process.env.VERCEL_GIT_COMMIT_SHA ? null : serverStartedAt,
    environment: process.env.VERCEL ? 'vercel' : process.env.NODE_ENV || 'development',
  };
}

function createApp({ projectRoot = __dirname, runtimeRoot = projectRoot } = {}) {
  const cacheKey = `${projectRoot}|${runtimeRoot}`;
  if (cachedApp && cachedKey === cacheKey) {
    return cachedApp;
  }

  const runtimePaths = getRuntimePaths({ projectRoot, runtimeRoot });
  process.env.DB_PATH = runtimePaths.dbPath;
  process.env.UPLOADS_DIR = runtimePaths.uploadsDir;
  process.env.DATA_DIR = runtimePaths.dataDir;
  process.env.BACKUPS_DIR = runtimePaths.backupsDir;

  const app = express();
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

  app.locals.runtimePaths = runtimePaths;

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (!isProd) {
    app.use(morgan('dev'));
  }

  app.use('/uploads', express.static(runtimePaths.uploadsDir));

  app.use('/api/contacts', require('./routes/contacts'));
  app.use('/api/driver-details', require('./routes/driverDetails'));
  app.use('/api/call-logs', require('./routes/callLogs'));
  app.use('/api/activity', require('./routes/activity'));
  app.use('/api/stats', require('./routes/stats'));
  app.use('/api/system', require('./routes/system'));
  app.get('/api/system/version', (_req, res) => {
    res.json({
      success: true,
      data: getReleaseMetadata(),
    });
  });

  if (fs.existsSync(runtimePaths.buildDir)) {
    app.use(express.static(runtimePaths.buildDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(runtimePaths.buildDir, 'index.html'));
    });
  }

  app.use((err, _req, res, _next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  });

  cachedApp = app;
  cachedKey = cacheKey;

  if (!process.env.VERCEL && !autoBackupTimer) {
    createBackup({ type: 'auto', label: 'startup' }).catch(() => {});
    autoBackupTimer = setInterval(() => {
      createBackup({ type: 'auto', label: 'scheduled' }).catch(() => {});
    }, 6 * 60 * 60 * 1000);
  }

  return app;
}

function startServer({
  port = Number(process.env.PORT) || 5000,
  host = '0.0.0.0',
  projectRoot = __dirname,
  runtimeRoot = projectRoot,
} = {}) {
  const app = createApp({ projectRoot, runtimeRoot });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      resolve({ app, server, port: server.address().port });
    });

    server.on('error', reject);
  });
}

const shouldCreateDefaultApp = !process.versions.electron;
const defaultApp = shouldCreateDefaultApp
  ? createApp({
      projectRoot: __dirname,
      runtimeRoot: Boolean(process.env.VERCEL) ? path.join('/tmp', 'zaya-runtime') : __dirname,
    })
  : null;

if (require.main === module) {
  startServer()
    .then(({ port }) => {
      console.log(`Zaya Calling System v2 running on http://localhost:${port}`);
    })
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = defaultApp || {};
module.exports.createApp = createApp;
module.exports.startServer = startServer;
