/**
 * Probe42 API client for private-company financials.
 * Gated on PROBE42_API_KEY_PROD. Probe42 requires calls to egress from an
 * allow-listed IP, so a VPN guard HARD-ABORTS before any call if the current
 * exit IP isn't the expected tunnel IP (VPN_EXPECTED_EXIT_IP).
 *
 * Endpoints (path prefix from PROBE42_PATH_PREFIX, prod default 'probe_pro'):
 *   GET /{PREFIX}/companies/{CIN}/datastatus            FREE
 *   GET /{PREFIX}/companies/{CIN}/comprehensive-details 1 CREDIT
 */
import { httpJson, httpText } from '../lib/http.mjs';

const BASE = 'https://api.probe42.in';
const KEY = process.env.PROBE42_API_KEY_PROD || '';
const PREFIX = process.env.PROBE42_PATH_PREFIX || 'probe_pro';
const VERSION = process.env.PROBE42_API_VERSION || '1.3';
const EXPECTED_IP = process.env.VPN_EXPECTED_EXIT_IP || '';

export const hasKey = () => !!KEY;

function headers() {
  return { 'x-api-key': KEY, 'x-api-version': VERSION, Accept: 'application/json' };
}

/** Current public exit IP, for the VPN guard. */
export async function currentExitIp() {
  for (const url of ['https://api.ipify.org', 'https://ifconfig.me/ip', 'https://checkip.amazonaws.com']) {
    try {
      const ip = (await httpText(url, { label: 'exit-ip', timeout: 15, retries: 2 })).trim();
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** HARD-ABORT unless the exit IP equals the expected tunnel IP. */
export async function assertVpn() {
  if (process.env.PROBE42_SKIP_VPN_CHECK === '1') return { ok: true, skipped: true };
  if (!EXPECTED_IP) throw new Error('VPN guard: VPN_EXPECTED_EXIT_IP is not set — refusing to call Probe42 outside the tunnel.');
  const ip = await currentExitIp();
  if (ip !== EXPECTED_IP) {
    throw new Error(`VPN guard: exit IP ${ip ?? 'unknown'} != expected ${EXPECTED_IP}. Probe42 is NOT routed through the tunnel — aborting before any call.`);
  }
  return { ok: true, ip };
}

export async function datastatus(cin) {
  if (!KEY) throw new Error('PROBE42_API_KEY_PROD not set');
  return httpJson(`${BASE}/${PREFIX}/companies/${cin}/datastatus`, { headers: headers(), label: `probe datastatus ${cin}`, timeout: 40 });
}

export async function comprehensive(cin) {
  if (!KEY) throw new Error('PROBE42_API_KEY_PROD not set');
  return httpJson(`${BASE}/${PREFIX}/companies/${cin}/comprehensive-details`, { headers: headers(), label: `probe comprehensive ${cin}`, timeout: 60 });
}
