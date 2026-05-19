const VALIDITY_UNITS = ['days', 'months', 'years'];

export const DEFAULT_NEW_USER_VALIDITY = {
  amount: 30,
  unit: 'days',
};

export const DEFAULT_LEGACY_VALIDITY = {
  amount: 12,
  unit: 'months',
};

export function normalizeValidityAmount(value, fallback = DEFAULT_NEW_USER_VALIDITY.amount) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function normalizeValidityUnit(value, fallback = DEFAULT_NEW_USER_VALIDITY.unit) {
  const normalized = String(value || '').toLowerCase();
  return VALIDITY_UNITS.includes(normalized) ? normalized : fallback;
}

export function isNeverExpiresUser(user) {
  return Boolean(user?.subscription_never_expires);
}

export function addValidityDuration(baseDate, amount, unit) {
  const next = new Date(baseDate instanceof Date ? baseDate.getTime() : baseDate);
  const normalizedAmount = normalizeValidityAmount(amount);
  const normalizedUnit = normalizeValidityUnit(unit);

  if (normalizedUnit === 'days') {
    next.setDate(next.getDate() + normalizedAmount);
  } else if (normalizedUnit === 'months') {
    next.setMonth(next.getMonth() + normalizedAmount);
  } else {
    next.setFullYear(next.getFullYear() + normalizedAmount);
  }

  return next;
}

export function buildSubscriptionTerms({
  amount = DEFAULT_NEW_USER_VALIDITY.amount,
  unit = DEFAULT_NEW_USER_VALIDITY.unit,
  neverExpires = false,
  startAt = new Date(),
} = {}) {
  const validityAmount = normalizeValidityAmount(amount);
  const validityUnit = normalizeValidityUnit(unit);
  const normalizedNeverExpires = Boolean(neverExpires);
  const expiresAt = normalizedNeverExpires
    ? null
    : addValidityDuration(startAt, validityAmount, validityUnit);

  return {
    subscription_validity_amount: validityAmount,
    subscription_validity_unit: validityUnit,
    subscription_never_expires: normalizedNeverExpires,
    subscription_expires_at: expiresAt ? expiresAt.toISOString() : null,
    subscription_status: 'active',
  };
}

export function normalizeUserSubscription(user, fallback = DEFAULT_LEGACY_VALIDITY) {
  const validityAmount = normalizeValidityAmount(
    user?.subscription_validity_amount ?? user?.validity_amount,
    fallback.amount,
  );
  const validityUnit = normalizeValidityUnit(
    user?.subscription_validity_unit ?? user?.validity_unit,
    fallback.unit,
  );
  const neverExpires = Boolean(user?.subscription_never_expires ?? user?.never_expires);

  const currentExpiresAt = user?.subscription_expires_at || user?.expires_at || null;
  const parsedExpiresAt = currentExpiresAt ? new Date(currentExpiresAt) : null;
  const validExpiresAt = neverExpires
    ? null
    : parsedExpiresAt && !Number.isNaN(parsedExpiresAt.getTime())
      ? parsedExpiresAt
      : addValidityDuration(new Date(), validityAmount, validityUnit);

  return {
    ...user,
    subscription_validity_amount: validityAmount,
    subscription_validity_unit: validityUnit,
    subscription_never_expires: neverExpires,
    subscription_expires_at: validExpiresAt ? validExpiresAt.toISOString() : null,
    subscription_status: neverExpires
      ? 'active'
      : user?.subscription_status === 'expired'
        ? 'expired'
        : 'active',
  };
}

export function isSubscriptionExpired(user, now = new Date()) {
  if (!user) return true;
  if (isNeverExpiresUser(user)) return false;
  if (user.subscription_status === 'expired') return true;

  const expiresAtValue = user.subscription_expires_at || user.expires_at;
  if (!expiresAtValue) return true;

  const expiresAt = new Date(expiresAtValue);
  if (Number.isNaN(expiresAt.getTime())) return true;

  return now.getTime() >= expiresAt.getTime();
}

export function formatSubscriptionDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
