const express = require('express');
const crypto = require('crypto');
const { Readable } = require('stream');

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self'; media-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-src 'none'; object-src 'none'; base-uri 'self'");
    next();
});
app.use(express.static('public'));

if (!process.env.UPSTREAM_ORIGIN) {
    throw new Error('UPSTREAM_ORIGIN must point to your existing public server, for example https://api.example.com');
}

let upstream;
try {
    upstream = new URL(process.env.UPSTREAM_ORIGIN);
    if (!['http:', 'https:'].includes(upstream.protocol)) throw new Error('Unsupported protocol');
} catch (error) {
    throw new Error(`Invalid UPSTREAM_ORIGIN: ${error.message}`);
}

const media = new Map();
const channels = new Map();
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

function token() { return crypto.randomBytes(18).toString('base64url'); }
function upstreamUrl(pathname, query = {}) {
    const url = new URL(pathname, upstream);
    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    }
    return url;
}
function sourceUrl(platform, id) {
    if (platform === 'youtube' && /^[A-Za-z0-9_-]{6,32}$/.test(id || '')) return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
    if (platform === 'niconico' && /^([a-z]{2})?\d+$/i.test(id || '')) return `https://www.nicovideo.jp/watch/${encodeURIComponent(id)}`;
    return null;
}
function registerMedia(url) {
    if (!url) return '';
    const id = token();
    media.set(id, { url, expiresAt: Date.now() + TOKEN_TTL_MS });
    return `/media/${id}`;
}
function registerChannel(url) {
    if (!url) return '';
    const id = token();
    channels.set(id, { url, expiresAt: Date.now() + TOKEN_TTL_MS });
    return id;
}
async function getJson(pathname, query) {
    const response = await fetch(upstreamUrl(pathname, query), { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
    return response.json();
}
function toPublicVideo(video) {
    return {
        id: String(video.id || ''),
        title: video.title || 'Untitled',
        thumbnail: registerMedia(video.thumbnail),
        duration: video.duration || 'N/A',
        channel: video.channel || 'Unknown',
        channelId: registerChannel(video.channel_url),
        views: Number(video.views) || 0
    };
}
function toPublicExtract(data) {
    return {
        details: {
            description: data.details?.description || '説明はありません',
            avatar: registerMedia(data.details?.avatar)
        },
        vids: (data.vids || []).map((format) => ({
            format_id: format.format_id, height: format.height, ext: format.ext, vcodec: format.vcodec,
            acodec: format.acodec, protocol: format.protocol, stream: registerMedia(format.url)
        })),
        audios: (data.audios || []).map((format) => ({
            format_id: format.format_id, abr: format.abr, ext: format.ext, protocol: format.protocol,
            stream: registerMedia(format.url)
        })),
        resolutions: data.resolutions || [],
        subtitle: registerMedia(data.subUrl)
    };
}
function toPublicComments(comments) {
    return (comments || []).map((comment) => ({
        author: comment.author || '', text: comment.text || '', time: comment.time || '',
        authorThumbnail: registerMedia(comment.author_thumbnail)
    }));
}
function clientHeaders(req) {
    const headers = { 'user-agent': req.headers['user-agent'] || 'muratube-render-proxy/1.0' };
    if (req.headers.range) headers.range = req.headers.range;
    return headers;
}
async function relay(req, res, pathname, query) {
    try {
        const response = await fetch(upstreamUrl(pathname, query), { headers: clientHeaders(req), redirect: 'follow' });
        const excluded = new Set(['connection', 'transfer-encoding', 'content-encoding', 'keep-alive']);
        for (const [name, value] of response.headers) if (!excluded.has(name.toLowerCase())) res.setHeader(name, value);
        res.status(response.status);
        if (!response.body) return res.end();
        Readable.fromWeb(response.body).pipe(res);
    } catch (error) {
        console.error('relay failed', error.message);
        if (!res.headersSent) res.status(502).json({ error: 'Upstream unavailable' });
        else res.end();
    }
}

app.get('/healthz', (_req, res) => res.json({ ok: true, upstream: upstream.origin }));

app.get('/api/search', async (req, res) => {
    try {
        const data = await getJson('/api/search', { q: req.query.q, platform: req.query.platform });
        res.json(Array.isArray(data) ? data.map(toPublicVideo) : data);
    } catch (_) { res.status(502).json({ error: '検索を取得できませんでした' }); }
});
app.get('/api/recommend', async (req, res) => {
    try {
        const data = await getJson('/api/recommend', { platform: req.query.platform });
        res.json(Array.isArray(data) ? data.map(toPublicVideo) : data);
    } catch (_) { res.status(502).json({ error: 'おすすめを取得できませんでした' }); }
});
app.get('/api/channel', async (req, res) => {
    const channel = channels.get(req.query.id);
    if (!channel || channel.expiresAt < Date.now()) return res.status(404).json({ error: 'チャンネル情報の有効期限が切れました。再検索してください。' });
    try {
        const data = await getJson('/api/channel', { url: channel.url });
        res.json(Array.isArray(data) ? data.map(toPublicVideo) : data);
    } catch (_) { res.status(502).json({ error: 'チャンネルを取得できませんでした' }); }
});
app.get('/api/extract', async (req, res) => {
    const url = sourceUrl(req.query.platform, req.query.id);
    if (!url) return res.status(400).json({ error: 'Invalid video' });
    try { res.json(toPublicExtract(await getJson('/api/extract', { url }))); }
    catch (_) { res.status(502).json({ error: '取得エラー' }); }
});
app.get('/api/comments', async (req, res) => {
    const url = sourceUrl(req.query.platform, req.query.id);
    if (!url) return res.status(400).json({ error: 'Invalid video' });
    try { res.json(toPublicComments(await getJson('/api/comments', { url }))); }
    catch (_) { res.json([]); }
});
app.get('/media/:id', (req, res) => {
    const asset = media.get(req.params.id);
    if (!asset || asset.expiresAt < Date.now()) return res.status(404).send('Media expired');
    relay(req, res, '/api/proxy', { url: asset.url });
});

// These endpoints have no external URLs in their response body, so they can be relayed unchanged.
app.get('/api/visit', (req, res) => relay(req, res, '/api/visit'));
app.get('/api/job-progress', (req, res) => relay(req, res, '/api/job-progress', { id: req.query.id }));
app.get('/api/job-file', (req, res) => relay(req, res, '/api/job-file', { id: req.query.id, type: req.query.type }));
app.post('/api/job-cancel', (req, res) => relay(req, res, '/api/job-cancel', { id: req.query.id }));
app.get('/api/job-start', async (req, res) => {
    const url = sourceUrl(req.query.platform, req.query.id);
    if (!url) return res.status(400).json({ error: 'Invalid video' });
    relay(req, res, '/api/job-start', { url, type: req.query.type, res: req.query.res, v_id: req.query.v_id, a_id: req.query.a_id });
});

app.use((_req, res) => res.status(404).send('Not found'));
setInterval(() => {
    const now = Date.now();
    for (const [id, item] of media) if (item.expiresAt < now) media.delete(id);
    for (const [id, item] of channels) if (item.expiresAt < now) channels.delete(id);
}, 10 * 60 * 1000).unref();

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => console.log(`Render relay listening on ${port}; upstream: ${upstream.origin}`));
