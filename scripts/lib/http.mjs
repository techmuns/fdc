/**
 * Tiny HTTP helper used by every fetcher.
 *
 * It shells out to `curl` on purpose: in this build environment outbound HTTPS
 * goes through a pre-configured agent proxy (curl already trusts its CA), and on
 * GitHub Actions runners curl reaches the internet directly. One code path works
 * in both places, with retries + exponential backoff.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pExecFile = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function httpText(url, opts = {}) {
  const { method = 'GET', headers = {}, body = null, timeout = 45, retries = 4, label = url } = opts;
  const args = ['-sS', '--fail', '--location', '--compressed', '--max-time', String(timeout)];
  if (method !== 'GET') args.push('-X', method);
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  if (body != null) args.push('--data-binary', typeof body === 'string' ? body : JSON.stringify(body));
  args.push(url);

  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const { stdout } = await pExecFile('curl', args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
      return stdout;
    } catch (e) {
      lastErr = e;
      if (attempt < retries - 1) await sleep(1500 * 2 ** attempt);
    }
  }
  throw new Error(`HTTP failed after ${retries} tries: ${label}\n${lastErr?.stderr || lastErr?.message || lastErr}`);
}

export async function httpJson(url, opts = {}) {
  const txt = await httpText(url, opts);
  try {
    return JSON.parse(txt);
  } catch {
    throw new Error(`Invalid JSON from ${opts.label || url}: ${txt.slice(0, 200)}`);
  }
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

/** Round to n decimals, returning a finite number or null. */
export function round(n, d = 2) {
  if (n == null || !isFinite(n)) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
