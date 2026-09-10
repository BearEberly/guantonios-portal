export function makeIdempotencyKey(prefix: string) {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${Date.now().toString(36)}_${value}`;
}

export function formatLocalDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Los_Angeles'
  }).format(date);
}

export function formatLocalTime(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles'
  }).format(date);
}

export function isoDateInLosAngeles(offsetDays = 0) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offsetDays);
  return formatter.format(now);
}

export function nextBookableDate() {
  for (let i = 0; i < 14; i += 1) {
    const iso = isoDateInLosAngeles(i);
    const dow = new Date(`${iso}T12:00:00-07:00`).getUTCDay();
    if (dow >= 2 && dow <= 6) return iso;
  }
  return isoDateInLosAngeles(1);
}

export function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}
