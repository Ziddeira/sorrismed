'use strict';

/*
 * Servidor do site SorrisMed (Node.js puro, sem dependências).
 *  - Serve os arquivos estáticos de /public com cache e compressão
 *  - POST /api/leads      recebe o formulário, valida, salva e (opcional) envia a um webhook
 *  - GET  /api/leads.csv  exporta os leads (protegido por senha via ADMIN_TOKEN)
 *  - GET  /api/health     verificação de saúde para o provedor de hospedagem
 */

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { validateLead, leadsToCsv, createRateLimiter } = require('./lib/leads');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const LEADS_FILE = process.env.LEADS_FILE || path.join(__dirname, 'data', 'leads.jsonl');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const LEAD_WEBHOOK_URL = process.env.LEAD_WEBHOOK_URL || '';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_BODY = 10 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt', '.xml', '.webmanifest']);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  // Ao instalar Google Analytics, Tag Manager ou Meta Pixel, libere os domínios deles aqui.
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "frame-src https://www.google.com",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ')
};

const isRateLimited = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });

function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) {
    return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  }
  return req.socket.remoteAddress || '';
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Payload muito grande'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readLeads() {
  try {
    const raw = await fsp.readFile(LEADS_FILE, 'utf8');
    return raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function forwardToWebhook(lead) {
  if (!LEAD_WEBHOOK_URL) return;
  try {
    const res = await fetch(LEAD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) console.error(`[lead] webhook respondeu ${res.status}`);
  } catch (err) {
    console.error('[lead] falha ao enviar webhook:', err.message);
  }
}

async function handleLead(req, res) {
  if (!String(req.headers['content-type'] || '').includes('application/json')) {
    return sendJson(res, 415, { ok: false, error: 'Use application/json.' });
  }
  if (isRateLimited(clientIp(req))) {
    return sendJson(res, 429, { ok: false, error: 'Muitas tentativas. Tente novamente em alguns minutos.' });
  }

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (err) {
    return sendJson(res, err.status || 400, { ok: false, error: 'Requisição inválida.' });
  }

  const result = validateLead(body);
  // Robôs recebem "sucesso" para não aprenderem a contornar o filtro
  if (result.spam) return sendJson(res, 200, { ok: true });
  if (!result.ok) return sendJson(res, 422, { ok: false, errors: result.errors });

  const lead = { id: crypto.randomUUID(), criadoEm: new Date().toISOString(), ...result.lead };
  await fsp.mkdir(path.dirname(LEADS_FILE), { recursive: true });
  await fsp.appendFile(LEADS_FILE, JSON.stringify(lead) + '\n', 'utf8');
  console.log(`[lead] ${lead.criadoEm} ${lead.nome} — ${lead.interesse}`);
  forwardToWebhook(lead);

  return sendJson(res, 201, { ok: true, id: lead.id });
}

function isAuthorized(req) {
  if (!ADMIN_TOKEN) return false;
  const header = String(req.headers.authorization || '');
  let given = '';
  if (header.startsWith('Bearer ')) given = header.slice(7);
  else if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    given = decoded.slice(decoded.indexOf(':') + 1);
  }
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(ADMIN_TOKEN).digest();
  return crypto.timingSafeEqual(a, b);
}

async function handleExport(req, res) {
  if (!isAuthorized(req)) {
    res.writeHead(401, { ...SECURITY_HEADERS, 'WWW-Authenticate': 'Basic realm="SorrisMed Leads", charset="UTF-8"' });
    return res.end(ADMIN_TOKEN ? 'Não autorizado' : 'Defina a variável ADMIN_TOKEN para habilitar a exportação.');
  }
  const csv = leadsToCsv(await readLeads());
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="leads-sorrismed-${new Date().toISOString().slice(0, 10)}.csv"`,
    'Cache-Control': 'no-store'
  });
  res.end(csv);
}

async function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    rel = '/';
  }
  if (rel.endsWith('/')) rel += 'index.html';

  let filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return notFound(req, res);

  let stat;
  try {
    stat = await fsp.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stat = await fsp.stat(filePath);
    }
  } catch {
    // URLs "bonitas": /privacidade -> /privacidade.html
    try {
      filePath += '.html';
      stat = await fsp.stat(filePath);
    } catch {
      return notFound(req, res);
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=604800',
    ETag: etag,
    Vary: 'Accept-Encoding'
  };

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }

  const stream = fs.createReadStream(filePath);
  const acceptsGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  if (COMPRESSIBLE.has(ext) && acceptsGzip) {
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip' });
    if (req.method === 'HEAD') return res.end();
    stream.pipe(zlib.createGzip()).pipe(res);
  } else {
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    if (req.method === 'HEAD') return res.end();
    stream.pipe(res);
  }
}

async function notFound(req, res) {
  let html = 'Página não encontrada';
  try {
    html = await fsp.readFile(path.join(PUBLIC_DIR, '404.html'), 'utf8');
  } catch { /* usa o texto simples */ }
  res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
  res.end(req.method === 'HEAD' ? undefined : html);
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (pathname === '/api/leads' && req.method === 'POST') return await handleLead(req, res);
    if (pathname === '/api/leads.csv' && req.method === 'GET') return await handleExport(req, res);
    if (pathname === '/api/health') return sendJson(res, 200, { ok: true });
    if (pathname.startsWith('/api/')) return sendJson(res, 404, { ok: false, error: 'Rota não encontrada.' });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }
    return await serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Erro interno.' });
    else res.end();
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`SorrisMed rodando em http://localhost:${PORT}`));
}

module.exports = server;
