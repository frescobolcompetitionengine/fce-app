const memoryStorage = new Map();

function getStorage() {
  return {
    getItem: (key) => memoryStorage.get(key) ?? null,
    setItem: (key, value) => memoryStorage.set(key, value),
    removeItem: (key) => memoryStorage.delete(key),
  };
}

export function generateId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function readJson(key, fallback) {
  try {
    const storage = getStorage();
    const raw = storage.getItem(key);
    if (raw) return JSON.parse(raw);

    return clone(fallback);
  } catch {
    return clone(fallback);
  }
}

export function writeJson(key, value) {
  getStorage().setItem(key, JSON.stringify(value));
}

export function removeItem(key) {
  const storage = getStorage();
  storage.removeItem(key);
}

export function sortItems(items, order = '-created_at') {
  const direction = String(order).startsWith('-') ? -1 : 1;
  const field = String(order).replace(/^-/, '');
  return [...items].sort((a, b) => {
    const av = a?.[field];
    const bv = b?.[field];
    if (av == null && bv == null) return 0;
    if (av == null) return 1 * direction;
    if (bv == null) return -1 * direction;

    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction;
    return String(av).localeCompare(String(bv)) * direction;
  });
}
