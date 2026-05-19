import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

let currentTrackedPath = null;
let previousTrackedPath = null;

const normalizePath = (path) => {
  const normalized = String(path || '').trim();
  if (!normalized) return null;
  return normalized.replace(/\/+$/, '') || '/';
};

const isTrackablePath = (path) => {
  const normalized = normalizePath(path);
  return Boolean(normalized) && normalized !== '/Login';
};

export function getTrackedPreviousPath() {
  return isTrackablePath(previousTrackedPath) ? previousTrackedPath : null;
}

export function clearTrackedNavigationPaths() {
  currentTrackedPath = null;
  previousTrackedPath = null;
}

export default function NavigationTracker() {
  const location = useLocation();

  useEffect(() => {
    const currentPath = normalizePath(location.pathname);
    if (!isTrackablePath(currentPath)) return;

    if (currentTrackedPath === currentPath) return;

    if (currentTrackedPath && isTrackablePath(currentTrackedPath)) {
      previousTrackedPath = currentTrackedPath;
    }

    currentTrackedPath = currentPath;
  }, [location.pathname]);

  return null;
}
