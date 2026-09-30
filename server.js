const express = require('express');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const { Readable } = require('node:stream');

const app = express();
const PORT = Number(process.env.PORT || 10000);
const upstream = new URL(process.env.UPSTREAM_BASE_URL || 'https://mrpvp.net');
const allowedOrigins = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
}));
app.use(express.static('public', { index: 'index.html' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: 'draft-8', legacyHeaders: false }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, upstream: upstream.origin });
});

function upstreamUrl(req) {
  // The browser can only select an API path and query.  It cannot select the
  // destination host, so this relay cannot be repurposed as an open proxy.
  return new URL(`${req.baseUrl}${req.path}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`, upstream);
}

function forwardHeaders(req) {
  const headers = {};
  for (const name of ['accept', 'content-type', 'range']) {
    if (req.headers[name]) headers[name] = req.headers[name];
  }
  return headers;
}

app.all('/api/{*path}', async (req, res) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const requestInit = {
      method: req.method,
      headers: forwardHeaders(req),
      redirect: 'manual',
      signal: controller.signal,
    };
    if (!['GET', 'HEAD'].includes(req.method)) requestInit.body = req;

    const response = await fetch(upstreamUrl(req), requestInit);
    res.status(response.status);
    for (const [name, value] of response.headers) {
      if (!['connection', 'keep-alive', 'transfer-encoding', 'content-encoding'].includes(name.toLowerCase())) {
        res.setHeader(name, value);
      }
    }
    if (!response.body) return res.end();
    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    const status = error.name === 'AbortError' ? 504 : 502;
    res.status(status).json({ error: 'Render relay could not reach the upstream API.' });
  } finally {
    clearTimeout(timeout);
  }
});

app.use((error, _req, res, _next) => {
  if (error.message === 'Origin is not allowed') return res.status(403).json({ error: error.message });
  res.status(500).json({ error: 'Unexpected relay error.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Render relay is listening on port ${PORT}`);
});
