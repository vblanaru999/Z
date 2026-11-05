import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { STATUSES, validateNote, validateTrailer } from './validate.js';

const MAX_BODY = 100 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  const payload = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= MAX_BODY) chunks.push(chunk); // keep draining so the client can read our 413
  }
  if (size > MAX_BODY) throw new HttpError(413, 'Request body too large');
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

const parseId = (s) => {
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(404, 'Not found');
  return n;
};

/** Build a request handler. `store` comes from createStore(); `publicDir` serves the UI. */
export function createHandler({ store, publicDir }) {
  async function api(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
    const method = req.method;
    const author = (req.headers['x-user-name'] || '').toString().slice(0, 100);

    if (parts[0] === 'meta' && parts.length === 1 && method === 'GET') {
      return send(res, 200, { statuses: STATUSES });
    }
    if (parts[0] !== 'trailers') throw new HttpError(404, 'Not found');

    if (parts.length === 1) {
      if (method === 'GET') {
        const status = url.searchParams.get('status') || undefined;
        if (status && !STATUSES.includes(status)) throw new HttpError(400, 'Unknown status');
        const q = (url.searchParams.get('q') || '').trim().slice(0, 100) || undefined;
        return send(res, 200, store.listTrailers({ status, q }));
      }
      if (method === 'POST') {
        const { errors, value } = validateTrailer(await readJson(req));
        if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
        return send(res, 201, store.createTrailer(value, author));
      }
      throw new HttpError(405, 'Method not allowed');
    }

    const id = parseId(parts[1]);

    if (parts.length === 2) {
      if (method === 'GET') {
        const t = store.getTrailer(id);
        if (!t) throw new HttpError(404, 'Trailer not found');
        return send(res, 200, t);
      }
      if (method === 'PATCH') {
        const { errors, value } = validateTrailer(await readJson(req), { partial: true });
        if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
        const t = store.updateTrailer(id, value, author);
        if (!t) throw new HttpError(404, 'Trailer not found');
        return send(res, 200, t);
      }
      if (method === 'DELETE') {
        if (!store.deleteTrailer(id)) throw new HttpError(404, 'Trailer not found');
        res.writeHead(204);
        return res.end();
      }
      throw new HttpError(405, 'Method not allowed');
    }

    if (parts.length === 3 && parts[2] === 'notes') {
      if (method !== 'POST') throw new HttpError(405, 'Method not allowed');
      const { errors, value } = validateNote(await readJson(req));
      if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
      const t = store.addNote(id, { body: value.body, author: value.author || author });
      if (!t) throw new HttpError(404, 'Trailer not found');
      return send(res, 201, t);
    }
    throw new HttpError(404, 'Not found');
  }

  async function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { throw new HttpError(400, 'Bad path'); }
    if (rel === '/') rel = '/index.html';
    const full = normalize(join(publicDir, rel));
    if (!full.startsWith(publicDir + sep)) throw new HttpError(403, 'Forbidden');
    try {
      const data = await readFile(full);
      res.writeHead(200, {
        'Content-Type': MIME[extname(full)] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      throw new HttpError(404, 'Not found');
    }
  }

  return async function handler(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return await api(req, res, url);
      return await serveStatic(req, res, url);
    } catch (err) {
      if (err instanceof HttpError) {
        return send(res, err.status, { error: err.message, ...(err.details && { details: err.details }) });
      }
      console.error(err);
      return send(res, 500, { error: 'Internal server error' });
    }
  };
}
