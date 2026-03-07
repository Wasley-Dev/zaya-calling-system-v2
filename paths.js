const fs = require('fs');
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

  ensureDir(dataDir);
  ensureDir(uploadsDir);
  ensureDir(backupsDir);

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
