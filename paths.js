const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveWithinRoot(targetPath, rootPath) {
  if (!targetPath) return null;
  return path.isAbsolute(targetPath) ? targetPath : path.join(rootPath, targetPath);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getFallbackRuntimePaths({ projectRoot = __dirname } = {}) {
  const rootDir = process.env.VERCEL ? path.join(os.tmpdir(), 'zaya-runtime') : projectRoot;
  const dataDir = path.join(rootDir, 'data');
  const uploadsDir = path.join(rootDir, 'uploads');
  const backupsDir = path.join(rootDir, 'backups');

  return {
    dataDir,
    uploadsDir,
    backupsDir,
    dbPath: path.join(dataDir, 'zaya.db'),
  };
}

function getRuntimePaths({ projectRoot = __dirname, runtimeRoot = projectRoot } = {}) {
  const isVercel = Boolean(process.env.VERCEL);
  const resolvedRuntimeRoot = path.resolve(runtimeRoot);
  const defaultDataDir = isVercel ? path.join('/tmp', 'zaya-data') : path.join(resolvedRuntimeRoot, 'data');
  const defaultUploadsDir = isVercel ? path.join('/tmp', 'zaya-uploads') : path.join(resolvedRuntimeRoot, 'uploads');
  const defaultBackupsDir = isVercel ? path.join('/tmp', 'zaya-backups') : path.join(resolvedRuntimeRoot, 'backups');

  const dataDir = resolveWithinRoot(process.env.DATA_DIR, resolvedRuntimeRoot) || defaultDataDir;
  const uploadsDir = resolveWithinRoot(process.env.UPLOADS_DIR, resolvedRuntimeRoot) || defaultUploadsDir;
  const backupsDir = resolveWithinRoot(process.env.BACKUPS_DIR, resolvedRuntimeRoot) || defaultBackupsDir;
  const dbPath = resolveWithinRoot(process.env.DB_PATH, resolvedRuntimeRoot) || path.join(dataDir, 'zaya.db');
  const buildDir = path.join(projectRoot, 'client', 'build');

  try {
    ensureDir(path.dirname(dbPath));
    ensureDir(dataDir);
    ensureDir(uploadsDir);
    ensureDir(backupsDir);
  } catch (_) {
    const fallback = getFallbackRuntimePaths({ projectRoot });
    ensureDir(path.dirname(fallback.dbPath));
    ensureDir(fallback.dataDir);
    ensureDir(fallback.uploadsDir);
    ensureDir(fallback.backupsDir);
    return {
      projectRoot: path.resolve(projectRoot),
      runtimeRoot: resolvedRuntimeRoot,
      dataDir: fallback.dataDir,
      uploadsDir: fallback.uploadsDir,
      backupsDir: fallback.backupsDir,
      dbPath: fallback.dbPath,
      buildDir,
    };
  }

  return {
    projectRoot: path.resolve(projectRoot),
    runtimeRoot: resolvedRuntimeRoot,
    dataDir,
    uploadsDir,
    backupsDir,
    dbPath,
    buildDir,
  };
}

module.exports = {
  getRuntimePaths,
};
