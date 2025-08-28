export function scrubPII(s) {
  if (!s) return s;
  // mask emails & obvious ids
  s = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
  s = s.replace(/\b\d{3}[-.\s]?\d{2,3}[-.\s]?\d{4}\b/g, '[phone]');
  return s;
}
