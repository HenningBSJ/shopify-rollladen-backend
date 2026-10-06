const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '..', 'data');
const accessFile = path.join(dataDir, 'material-status-access.json');
const stateFile = path.join(dataDir, 'material-status.json');

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJsonFile(filePath, obj) {
  try { fs.mkdirSync(path.dirname(filePath), { recursive: true }); } catch (e) {}
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj || {}, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function ensureMaterialStatusAccess() {
  const current = readJsonFile(accessFile, null);
  if (current && typeof current.token === 'string' && current.token.trim()) {
    return current;
  }
  const created = {
    token: crypto.randomBytes(18).toString('hex'),
    createdAt: new Date().toISOString(),
  };
  writeJsonFile(accessFile, created);
  return created;
}

function getMaterialStatusToken() {
  return String(ensureMaterialStatusAccess().token || '').trim();
}

function isMaterialStatusTokenValid(token) {
  const required = getMaterialStatusToken();
  const given = String(token || '').trim();
  return !!required && !!given && given === required;
}

function loadMaterialStatusState() {
  const state = readJsonFile(stateFile, {});
  const inventory = state && typeof state.inventory === 'object' && state.inventory ? state.inventory : {};
  const productOverrides = state && typeof state.productOverrides === 'object' && state.productOverrides ? state.productOverrides : {};
  const itemStats = state && typeof state.itemStats === 'object' && state.itemStats ? state.itemStats : {};
  const materialChecks = state && typeof state.materialChecks === 'object' && state.materialChecks ? state.materialChecks : {};
  return {
    inventory,
    productOverrides,
    itemStats,
    materialChecks,
    updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : '',
  };
}

function saveMaterialStatusState(input) {
  const inventory = input && typeof input.inventory === 'object' && input.inventory ? input.inventory : {};
  const productOverrides = input && typeof input.productOverrides === 'object' && input.productOverrides ? input.productOverrides : {};
  const itemStats = input && typeof input.itemStats === 'object' && input.itemStats ? input.itemStats : {};
  const materialChecks = input && typeof input.materialChecks === 'object' && input.materialChecks ? input.materialChecks : {};
  const out = {
    inventory,
    productOverrides,
    itemStats,
    materialChecks,
    updatedAt: new Date().toISOString(),
  };
  writeJsonFile(stateFile, out);
  return out;
}

module.exports = {
  ensureMaterialStatusAccess,
  getMaterialStatusToken,
  isMaterialStatusTokenValid,
  loadMaterialStatusState,
  saveMaterialStatusState,
};
