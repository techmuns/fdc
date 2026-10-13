/**
 * Fetch a rating-rationale doc as plain text. ZERO API keys, ZERO Firecrawl.
 * CRISIL = HTML (needs a browser User-Agent); CARE/ICRA/Infomerics/Acuité = PDF
 * (downloaded then run through `pdftotext -layout`, which preserves the column
 * alignment the parser relies on). Retries handle flaky agency hosts (ICRA).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pExec = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(td|th|tr|table|div|p|br|li)>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/(\s*\|\s*)+/g, ' | ')
    .trim();
}

async function curlText(url) {
  const { stdout } = await pExec('curl', [
    '-sSL', '--fail', '--compressed', '--max-time', '50',
    '-A', UA, '-H', 'Accept: text/html,application/xhtml+xml',
    '-H', 'Accept-Language: en-US,en', url,
  ], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  return stdout;
}

async function curlPdfToText(url) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'rr-'));
  const pdf = path.join(dir, 'doc.pdf');
  try {
    await pExec('curl', [
      '-sSL', '--fail', '--max-time', '70', '-A', UA,
      '-H', `Referer: ${new URL(url).origin}/`, '-o', pdf, url,
    ], { maxBuffer: 128 * 1024 * 1024 });
    const { stdout } = await pExec('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
    if (!stdout || stdout.length < 200) throw new Error('empty pdftotext output');
    return stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function fetchDocText(url, docType, retries = 4) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return docType === 'html' ? htmlToText(await curlText(url)) : await curlPdfToText(url);
    } catch (e) {
      lastErr = e;
      if (i < retries - 1) await sleep(2000 * 2 ** i);
    }
  }
  throw new Error(`fetch failed (${docType}): ${url}\n${lastErr?.stderr || lastErr?.message || lastErr}`);
}
