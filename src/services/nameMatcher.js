function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function nameMatchScore(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1.0;
  const wa = na.split(' ').filter((w) => w.length > 2);
  const wb = new Set(nb.split(' ').filter((w) => w.length > 2));
  if (!wa.length || !wb.size) return 0;
  const common = wa.filter((w) => wb.has(w)).length;
  return common / Math.max(wa.length, wb.size);
}

export function findCustomerMatch(name, customers, threshold = 0.8) {
  if (!name || !customers?.length) return null;
  let best = null, bestScore = 0;
  for (const c of customers) {
    const score = nameMatchScore(name, c.name);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore >= threshold ? best : null;
}
