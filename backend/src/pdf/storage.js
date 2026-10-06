const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeJoin(baseDir, parts) {
  const joined = path.join(baseDir, ...parts);
  const normalizedBase = path.resolve(baseDir) + path.sep;
  const normalizedTarget = path.resolve(joined);
  if (!normalizedTarget.startsWith(normalizedBase)) {
    const err = new Error('Invalid path');
    err.status = 400;
    throw err;
  }
  return joined;
}

class LocalStorageProvider {
  constructor({ baseDir, publicBaseUrl }) {
    this.baseDir = baseDir;
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, '');
  }

  getObjectKey({ orderId, type }) {
    const date = new Date();
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `pdfs/orders/${orderId}/${type}_${orderId}_${yyyy}${mm}${dd}.html`;
  }

  async put({ key, contentType, body }) {
    const targetPath = safeJoin(this.baseDir, key.split('/'));
    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, body);
    return { url: `${this.publicBaseUrl}/${key}`, contentType };
  }

  async exists({ key }) {
    const targetPath = safeJoin(this.baseDir, key.split('/'));
    return fs.existsSync(targetPath);
  }
}

function createStorageProvider() {
  const baseDir = process.env.PDF_LOCAL_DIR || path.join(process.cwd(), 'tmp');
  const publicBaseUrl = process.env.PDF_PUBLIC_BASE_URL || 'http://localhost:3000';
  return new LocalStorageProvider({ baseDir, publicBaseUrl });
}

module.exports = {
  createStorageProvider,
};

