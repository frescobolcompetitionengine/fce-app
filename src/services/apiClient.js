const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
const isProdBuild = Boolean(env.PROD);
const STORAGE_MODE = env.VITE_STORAGE_MODE || 'server';
const RUNTIME_ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';
const API_BASE_URL = env.VITE_API_BASE_URL || (STORAGE_MODE === 'server' ? (isProdBuild ? RUNTIME_ORIGIN : 'http://127.0.0.1:8787') : '');
const DEFAULT_API_ORIGIN = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:5173';
const API_BASE_URLS = Array.from(new Set([
  API_BASE_URL,
  STORAGE_MODE === 'server' && !isProdBuild ? 'http://127.0.0.1:8787' : '',
  STORAGE_MODE === 'server' && !isProdBuild ? 'http://localhost:8787' : '',
  STORAGE_MODE === 'server' && isProdBuild ? RUNTIME_ORIGIN : '',
].filter(Boolean)));

export function isServerStorageMode() {
  return STORAGE_MODE === 'server';
}

function buildUrl(path, params = {}, baseUrl = API_BASE_URL || DEFAULT_API_ORIGIN) {
  const url = new URL(path, baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

export function resolveApiUrl(path) {
  return buildUrl(path, {}, API_BASE_URLS[0] || DEFAULT_API_ORIGIN);
}

export function resolveApiUrls(path) {
  const bases = API_BASE_URLS.length > 0 ? API_BASE_URLS : [DEFAULT_API_ORIGIN];
  return bases.map((baseUrl) => buildUrl(path, {}, baseUrl));
}

export async function fetchWithApiFallback(
  path,
  { method = 'GET', body = null, headers = {}, params = {}, timeoutMs = 10000 } = {},
) {
  const bases = API_BASE_URLS.length > 0 ? API_BASE_URLS : [DEFAULT_API_ORIGIN];
  let lastError = null;

  for (const baseUrl of bases) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller && Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
      ? globalThis.setTimeout(() => controller.abort(), Number(timeoutMs))
      : null;

    try {
      const response = await fetch(buildUrl(path, params, baseUrl), {
        method,
        headers: body
          ? {
              ...(typeof body === 'string' || body instanceof Blob || body instanceof FormData
                ? {}
                : { 'Content-Type': 'application/json' }),
              ...headers,
            }
          : headers,
        body: body
          ? (typeof body === 'string' || body instanceof Blob || body instanceof FormData
            ? body
            : JSON.stringify(body))
          : undefined,
        signal: controller?.signal,
      });
      return response;
    } catch (error) {
      lastError = error;
    } finally {
      if (timeoutId) {
        globalThis.clearTimeout(timeoutId);
      }
    }
  }

  throw lastError || new Error('Backend local não respondeu a tempo.');
}

export async function apiRequest(path, { method = 'GET', body = null, params = {}, timeoutMs = 2500 } = {}) {
  try {
    const response = await fetchWithApiFallback(path, { method, body, params, timeoutMs });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Request failed with ${response.status}`);
    }

    if (response.status === 204) return null;
    return response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Backend local não respondeu a tempo.');
    }
    throw error;
  }
}
