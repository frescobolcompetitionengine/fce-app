import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import {
  deleteAnalysisReportRawText,
  createUploadedFile,
  createSafetySystemBackup,
  createSystemBackup,
  createUsersBackup,
  deleteManyRecords,
  deleteManyUserBackups,
  deleteSystemBackup,
  deleteManySystemBackups,
  deleteUserBackup,
  deleteRecord,
  getUploadedFile,
  getRecord,
  listSystemBackups,
  healthCheck,
  readAnalysisReportRawText,
  IMAGE_DIR,
  listRecords,
  listUserBackups,
  restoreUsersBackup,
  restoreSystemBackup,
  writeAnalysisReportRawText,
  upsertRecord,
} from './db.mjs';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const AUTH_SESSION_COOKIE = 'fce_auth_session_id';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIST_DIR = path.join(__dirname, '..', 'dist');
const APP_INDEX_PATH = path.join(APP_DIST_DIR, 'index.html');

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, statusCode, filePath, contentType) {
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    sendJson(res, 404, { error: 'file not found' });
  });
  res.writeHead(statusCode, {
    'Content-Type': contentType || 'application/octet-stream',
    'Content-Length': fs.statSync(filePath).size,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  stream.pipe(res);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js' || ext === '.mjs') return 'application/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.ico') return 'image/x-icon';
  if (ext === '.woff') return 'font/woff';
  if (ext === '.woff2') return 'font/woff2';
  if (ext === '.map') return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function safeResolveDistPath(requestPath) {
  const normalized = path.normalize(String(requestPath || '')).replace(/^([/\\])+/, '');
  const resolved = path.resolve(APP_DIST_DIR, normalized);
  return resolved.startsWith(APP_DIST_DIR) ? resolved : null;
}

function serveAppIndex(res) {
  if (!fs.existsSync(APP_INDEX_PATH)) {
    sendJson(res, 404, { error: 'frontend build not found' });
    return;
  }
  sendFile(res, 200, APP_INDEX_PATH, 'text/html; charset=utf-8');
}

function serveStaticAsset(res, pathname) {
  const filePath = safeResolveDistPath(pathname);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }
  sendFile(res, 200, filePath, getContentType(filePath));
  return true;
}

function sendText(res, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(String(text ?? ''), 'utf8'),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(String(text ?? ''));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function readTextBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function parseCookies(cookieHeader = '') {
  return String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) return acc;
      const key = decodeURIComponent(part.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      if (key) acc[key] = value;
      return acc;
    }, {});
}

function buildCookie(name, value, options = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  parts.push('Path=/');
  parts.push('SameSite=Lax');
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.maxAge != null) parts.push(`Max-Age=${Math.max(0, Number(options.maxAge) || 0)}`);
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

function getCollection(reqUrl) {
  return reqUrl.searchParams.get('collection');
}

function mimeToExtension(mimeType = '') {
  const normalized = String(mimeType).toLowerCase();
  if (normalized.includes('png')) return '.png';
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return '.jpg';
  if (normalized.includes('webp')) return '.webp';
  if (normalized.includes('gif')) return '.gif';
  if (normalized.includes('bmp')) return '.bmp';
  if (normalized.includes('svg')) return '.svg';
  return '.bin';
}

function extractBase64Payload(dataUrl) {
  const text = String(dataUrl || '');
  const match = text.match(/^data:([^;]+);base64,(.*)$/);
  if (match) {
    return {
      mimeType: match[1],
      base64: match[2],
    };
  }
  return {
    mimeType: '',
    base64: text,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = reqUrl;

    if (req.method === 'OPTIONS') {
      sendJson(res, 204, { ok: true });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, healthCheck());
      return;
    }

    if (pathname === '/api/auth/session' && req.method === 'GET') {
      const cookies = parseCookies(req.headers.cookie || '');
      const sessionId = cookies[AUTH_SESSION_COOKIE];
      if (!sessionId) {
        sendJson(res, 404, { error: 'session not found' });
        return;
      }
      const session = getRecord('auth_sessions', sessionId);
      if (!session) {
        res.setHeader('Set-Cookie', buildCookie(AUTH_SESSION_COOKIE, '', { maxAge: 0 }));
        sendJson(res, 404, { error: 'session not found' });
        return;
      }
      sendJson(res, 200, session);
      return;
    }

    if (pathname === '/api/auth/session' && req.method === 'POST') {
      const body = await readBody(req).catch(() => null);
      if (!body || typeof body !== 'object') {
        sendJson(res, 400, { error: 'invalid body' });
        return;
      }

      const cookies = parseCookies(req.headers.cookie || '');
      const existingSessionId = cookies[AUTH_SESSION_COOKIE] || body.id || null;
      const saved = upsertRecord('auth_sessions', existingSessionId, body, body);
      if (saved?.id) {
        res.setHeader('Set-Cookie', buildCookie(AUTH_SESSION_COOKIE, saved.id, { httpOnly: true }));
      }
      sendJson(res, 201, saved);
      return;
    }

    if (pathname === '/api/auth/session' && req.method === 'DELETE') {
      const cookies = parseCookies(req.headers.cookie || '');
      const sessionId = cookies[AUTH_SESSION_COOKIE];
      if (sessionId) {
        try {
          deleteRecord('auth_sessions', sessionId);
        } catch {
          // Ignore cleanup failures.
        }
      }
      res.setHeader('Set-Cookie', buildCookie(AUTH_SESSION_COOKIE, '', { maxAge: 0, httpOnly: true }));
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/')) {
      // API routes continue below.
    } else if (req.method === 'GET') {
      if (pathname !== '/' && serveStaticAsset(res, pathname)) {
        return;
      }
      serveAppIndex(res);
      return;
    }

  const imageMatch = pathname.match(/^\/api\/uploads\/images\/([^/]+)$/);
  if (imageMatch && req.method === 'GET') {
    const file = getUploadedFile(decodeURIComponent(imageMatch[1]));
    if (!file || !fs.existsSync(file.storage_path)) {
      sendJson(res, 404, { error: 'file not found' });
      return;
    }
    sendFile(res, 200, file.storage_path, file.mime_type);
    return;
  }

  if (pathname === '/api/uploads/images' && req.method === 'POST') {
    const body = await readBody(req).catch(() => null);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, { error: 'invalid body' });
      return;
    }

    const dataUrl = body.data_url || body.dataUrl || body.base64 || body.file_data;
    if (!dataUrl || typeof dataUrl !== 'string') {
      sendJson(res, 400, { error: 'data_url is required' });
      return;
    }

    const originalName = typeof body.file_name === 'string' ? body.file_name : typeof body.fileName === 'string' ? body.fileName : 'image';
    const preferredMimeType = typeof body.mime_type === 'string' ? body.mime_type : typeof body.mimeType === 'string' ? body.mimeType : '';
    const { mimeType: parsedMimeType, base64 } = extractBase64Payload(dataUrl);
    const mimeType = preferredMimeType || parsedMimeType || 'application/octet-stream';
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) {
      sendJson(res, 400, { error: 'invalid image payload' });
      return;
    }

    const fileId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const extension = path.extname(originalName) || mimeToExtension(mimeType);
    const storedName = `${fileId}${extension}`;
    const storagePath = path.join(IMAGE_DIR, storedName);
    fs.writeFileSync(storagePath, buffer);

    const record = createUploadedFile({
      id: fileId,
      originalName,
      storedName,
      mimeType,
      size: buffer.length,
      storagePath,
      urlPath: `/api/uploads/images/${fileId}`,
    });

    sendJson(res, 201, record);
    return;
  }

  const analysisUploadMatch = pathname.match(/^\/api\/uploads\/analysis-reports\/([^/]+)$/);
  if (analysisUploadMatch && req.method === 'GET') {
    const reportId = decodeURIComponent(analysisUploadMatch[1]);
    const rawText = readAnalysisReportRawText(reportId);
    if (rawText == null) {
      sendJson(res, 404, { error: 'file not found' });
      return;
    }
    sendText(res, 200, rawText, 'text/plain; charset=utf-8');
    return;
  }

  if (analysisUploadMatch && req.method === 'POST') {
    const reportId = decodeURIComponent(analysisUploadMatch[1]);
    const rawText = await readTextBody(req).catch(() => '');
    const stored = writeAnalysisReportRawText(reportId, rawText);
    sendJson(res, 201, {
      id: stored.id,
      raw_text_url: stored.raw_text_url,
      raw_text_size: stored.size,
    });
    return;
  }

  if (pathname === '/api/records' && req.method === 'GET') {
    const collection = getCollection(reqUrl);
    if (!collection) {
      sendJson(res, 400, { error: 'collection is required' });
      return;
    }

    const order = reqUrl.searchParams.get('order') || '-updated_at';
    const limit = reqUrl.searchParams.get('limit') || 500;
    const ownerUserId = reqUrl.searchParams.get('owner_user_id');
    sendJson(res, 200, listRecords(collection, {
      order,
      limit,
      ownerUserId,
      compact: collection === 'analysis_reports',
    }));
    return;
  }

  if (pathname === '/api/records' && req.method === 'POST') {
    const collection = getCollection(reqUrl);
    if (!collection) {
      sendJson(res, 400, { error: 'collection is required' });
      return;
    }

    const body = await readBody(req).catch(() => null);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, { error: 'invalid body' });
      return;
    }

    const created = upsertRecord(collection, body.id, body, body);
    sendJson(res, 201, created);
    return;
  }

  const recordMatch = pathname.match(/^\/api\/records\/([^/]+)$/);
  if (recordMatch && (req.method === 'PATCH' || req.method === 'DELETE' || req.method === 'GET')) {
    const collection = getCollection(reqUrl);
    if (!collection) {
      sendJson(res, 400, { error: 'collection is required' });
      return;
    }

    const id = decodeURIComponent(recordMatch[1]);
    if (req.method === 'GET') {
      const rows = listRecords(collection, {
        order: '-updated_at',
        limit: 5000,
        compact: collection === 'analysis_reports',
      });
      const found = rows.find((item) => item.id === id) || null;
      sendJson(res, found ? 200 : 404, found || { error: 'not found' });
      return;
    }

    if (req.method === 'DELETE') {
      const existingRecord = getRecord(collection, id);
      if (!existingRecord) {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
      await createSafetySystemBackup({
        reason: `before_delete_${collection}`,
        source: 'server.index',
        includeUploads: true,
      });
      if (collection === 'analysis_reports') {
        deleteAnalysisReportRawText(id);
      }
      sendJson(res, 200, deleteRecord(collection, id));
      return;
    }

    const body = await readBody(req).catch(() => null);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, { error: 'invalid body' });
      return;
    }

    const updated = upsertRecord(collection, id, body, body);
    sendJson(res, 200, updated);
    return;
  }

  if (pathname === '/api/records/bulk-delete' && req.method === 'POST') {
    const collection = getCollection(reqUrl);
    const body = await readBody(req).catch(() => null);
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    if (!collection) {
      sendJson(res, 400, { error: 'collection is required' });
      return;
    }
    if (ids.length > 0) {
      await createSafetySystemBackup({
        reason: `before_bulk_delete_${collection}`,
        source: 'server.index',
        includeUploads: true,
      });
    }
    sendJson(res, 200, deleteManyRecords(collection, ids));
    return;
  }

  if (pathname === '/api/backups/users' && req.method === 'GET') {
    const limit = reqUrl.searchParams.get('limit') || 25;
    sendJson(res, 200, listUserBackups(limit));
    return;
  }

  if (pathname === '/api/backups/users' && req.method === 'POST') {
    const body = await readBody(req).catch(() => null);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, { error: 'invalid body' });
      return;
    }

    const users = Array.isArray(body.users) ? body.users : [];
    const reason = typeof body.reason === 'string' ? body.reason : 'auto';
    const source = typeof body.source === 'string' ? body.source : 'usersRepository';
    const backup = createUsersBackup(users, { reason, source });
    sendJson(res, 201, backup);
    return;
  }

  if (pathname === '/api/backups/users/bulk-delete' && req.method === 'POST') {
    const body = await readBody(req).catch(() => null);
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    sendJson(res, 200, deleteManyUserBackups(ids));
    return;
  }

  const deleteBackupMatch = pathname.match(/^\/api\/backups\/users\/([^/]+)$/);
  if (deleteBackupMatch && req.method === 'DELETE') {
    const backupId = decodeURIComponent(deleteBackupMatch[1]);
    const deleted = deleteUserBackup(backupId);
    if (!deleted) {
      sendJson(res, 404, { error: 'backup not found' });
      return;
    }
    sendJson(res, 200, deleted);
    return;
  }

  const restoreBackupMatch = pathname.match(/^\/api\/backups\/users\/([^/]+)\/restore$/);
  if (restoreBackupMatch && req.method === 'POST') {
    const body = await readBody(req).catch(() => null);
    const backupId = decodeURIComponent(restoreBackupMatch[1]);
    const restored = restoreUsersBackup(backupId, {
      createSafetyBackup: body?.create_safety_backup !== false,
      reason: typeof body?.reason === 'string' ? body.reason : 'restore',
      source: typeof body?.source === 'string' ? body.source : 'server.index',
    });
    if (!restored) {
      sendJson(res, 404, { error: 'backup not found' });
      return;
    }
    sendJson(res, 200, restored);
    return;
  }

  if (pathname === '/api/backups/system' && req.method === 'GET') {
    const limit = reqUrl.searchParams.get('limit') || 25;
    sendJson(res, 200, listSystemBackups(limit));
    return;
  }

  if (pathname === '/api/backups/system' && req.method === 'POST') {
    const body = await readBody(req).catch(() => null);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, { error: 'invalid body' });
      return;
    }

    const reason = typeof body.reason === 'string' ? body.reason : 'manual';
    const source = typeof body.source === 'string' ? body.source : 'server.index';
    const includeUploads = body.include_uploads !== false;
    const backup = createSystemBackup({ reason, source, includeUploads });
    sendJson(res, 201, backup);
    return;
  }

  if (pathname === '/api/backups/system/bulk-delete' && req.method === 'POST') {
    const body = await readBody(req).catch(() => null);
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    sendJson(res, 200, deleteManySystemBackups(ids));
    return;
  }

  const deleteSystemBackupMatch = pathname.match(/^\/api\/backups\/system\/([^/]+)$/);
  if (deleteSystemBackupMatch && req.method === 'DELETE') {
    const backupId = decodeURIComponent(deleteSystemBackupMatch[1]);
    const deleted = deleteSystemBackup(backupId);
    if (!deleted) {
      sendJson(res, 404, { error: 'backup not found' });
      return;
    }
    sendJson(res, 200, deleted);
    return;
  }

  const restoreSystemBackupMatch = pathname.match(/^\/api\/backups\/system\/([^/]+)\/restore$/);
  if (restoreSystemBackupMatch && req.method === 'POST') {
    const body = await readBody(req).catch(() => null);
    const backupId = decodeURIComponent(restoreSystemBackupMatch[1]);
    const restored = restoreSystemBackup(backupId, {
      createSafetyBackup: body?.create_safety_backup !== false,
      reason: typeof body?.reason === 'string' ? body.reason : 'restore',
      source: typeof body?.source === 'string' ? body.source : 'server.index',
    });
    if (!restored) {
      sendJson(res, 404, { error: 'backup not found' });
      return;
    }
    sendJson(res, 200, restored);
    return;
  }

    sendJson(res, 404, { error: 'not found' });
  } catch (error) {
    console.error('API error', error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'internal server error' });
    } else {
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Backend API running at http://${HOST}:${PORT}`);
});
