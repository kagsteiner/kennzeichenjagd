/**
 * Minimaler Static-Server für dist/, hinter nginx auf einem eigenen Port
 * (siehe Portliste in der VPS-nginx-Konfiguration). Keine Abhängigkeiten,
 * damit pm2 die App ohne extra Installationsschritt starten kann.
 *
 * nginx entfernt das "/kennzeichenjagd/"-Präfix beim Weiterreichen (trailing
 * slash in proxy_pass) — hier kommt also alles so an, als läge dist/ auf "/".
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 3023;
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function resolveFile(urlPath) {
  const cleaned = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  const candidate = join(ROOT, cleaned === '/' ? 'index.html' : cleaned);
  try {
    const info = await stat(candidate);
    return info.isDirectory() ? join(candidate, 'index.html') : candidate;
  } catch {
    // Kein Client-Routing in dieser App — unbekannte Pfade landen trotzdem
    // auf index.html, statt einen nackten 404 zu zeigen.
    return join(ROOT, 'index.html');
  }
}

createServer(async (req, res) => {
  try {
    const path = await resolveFile(req.url.split('?')[0] ?? '/');
    // index.html-Aufrufe sind die einzige Näherung an "App-Start", die ein
    // Static-Server sehen kann — Folge-Requests für JS/CSS/Bilder loggen wir nicht.
    if (path.endsWith('index.html')) console.log(`[start] ${new Date().toISOString()}`);
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`Kennzeichenjagd läuft auf http://127.0.0.1:${PORT}`);
});
