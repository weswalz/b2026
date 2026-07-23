// IndexNow client — pings search engines when indexable content changes.
// Protocol: https://www.indexnow.org/documentation (POST /indexnow, JSON body
// {host, key, keyLocation, urlList}, key file hosted at https://<host>/<key>.txt).
// Fire-and-forget: a failed ping must never break the mutating request it's attached to.
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

// 1-hour in-memory dedup so repeated saves of the same URL (e.g. autosave, rapid
// edits) don't spam the endpoint. Cleared entries are just allowed to re-fire.
const DEDUP_WINDOW_MS = 60 * 60 * 1000;
const recentlyPinged = new Map(); // url -> timestamp

function pruneDedup(now) {
  for (const [url, ts] of recentlyPinged) {
    if (now - ts > DEDUP_WINDOW_MS) recentlyPinged.delete(url);
  }
}

// Submits one or more absolute URLs to IndexNow. Resolves to true/false; never throws.
// Skips silently (resolves false) when INDEXNOW_KEY is unset — B7 must be a no-op
// until the env var is configured, per spec.
async function pingIndexNow(urls) {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return false;

  const list = (Array.isArray(urls) ? urls : [urls]).filter((u) => typeof u === 'string' && u.length > 0);
  if (list.length === 0) return false;

  const now = Date.now();
  pruneDedup(now);
  const fresh = list.filter((u) => !recentlyPinged.has(u));
  if (fresh.length === 0) return false;

  let host;
  try {
    host = new URL(fresh[0]).host;
  } catch (_e) {
    console.warn('pingIndexNow: could not parse host from URL', fresh[0]);
    return false;
  }

  const body = {
    host,
    key,
    keyLocation: `https://${host}/${key}.txt`,
    urlList: fresh,
  };

  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`IndexNow ping failed: HTTP ${res.status}`);
      return false;
    }
    for (const u of fresh) recentlyPinged.set(u, now);
    return true;
  } catch (err) {
    console.warn('IndexNow ping failed:', err.message || err);
    return false;
  }
}

module.exports = { pingIndexNow, INDEXNOW_ENDPOINT };
