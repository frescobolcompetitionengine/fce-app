const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
const STORAGE_MODE = env.VITE_STORAGE_MODE || 'server';
const API_BASE_URL = env.VITE_API_BASE_URL || '/api';
const API_BASE_URLS = [API_BASE_URL];

export function isServerStorageMode() {
  return STORAGE_MODE === 'server';
}

function buildUrl(path, params = {}, baseUrl = API_BASE_URL || '/api') {
  const resolvedBaseUrl = String(baseUrl || '').startsWith('/')
    ? `${typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8787'}${baseUrl}`
    : baseUrl;
  const url = new URL(path, resolvedBaseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

export function resolveApiUrl(path) {
  return buildUrl(path, {}, API_BASE_URLS[0] || '/api');
}

export function resolveApiUrls(path) {
  const bases = API_BASE_URLS.length > 0 ? API_BASE_URLS : ['/api'];
  return bases.map((baseUrl) => buildUrl(path, {}, baseUrl));
}

export async function fetchWithApiFallback(
  path,
  { method = 'GET', body = null, headers = {}, params = {}, timeoutMs = 10000 } = {},
) {
  const bases = API_BASE_URLS.length > 0 ? API_BASE_URLS : ['/api'];
  let lastError = null;

  for (const baseUrl of bases) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller && Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
      ? globalThis.setTimeout(() => controller.abort(), Number(timeoutMs))
      : null;

    try {
      const response = await fetch(buildUrl(path, params, baseUrl), {
        method,
        credentials: 'include',
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
