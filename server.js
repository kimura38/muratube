const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');

const app = express();

// HTMLから直接アクセスできるようにCORSを許可
app.use(cors());

// メインサーバーのURL（Renderの環境変数 NODE_SERVER で上書き可能）
const NODE_SERVER = process.env.NODE_SERVER || 'https://mrpvp.net';

// すべてのリクエストをメインサーバーへ中継する
app.use('/', (req, res) => {
    const action = req.query.action;
    let targetUrl = '';
    let method = 'GET';

    if (action === 'search') {
        targetUrl = `${NODE_SERVER}/api/search?q=${encodeURIComponent(req.query.q || '')}&platform=${req.query.platform || 'youtube'}&page=${encodeURIComponent(req.query.page || '0')}`;
    } else if (action === 'health') {
        targetUrl = `${NODE_SERVER}/api/health`;
    } else if (action === 'recommend') {
        targetUrl = `${NODE_SERVER}/api/recommend?platform=${encodeURIComponent(req.query.platform || 'youtube')}&seed=${encodeURIComponent(req.query.seed || '')}`;
    } else if (action === 'shorts') {
        targetUrl = `${NODE_SERVER}/api/shorts?platform=${encodeURIComponent(req.query.platform || 'youtube')}`;
    } else if (action === 'extract') {
        const queryStr = req.query.id
            ? `id=${encodeURIComponent(req.query.id)}`
            : `url=${encodeURIComponent(req.query.url || '')}`;
        targetUrl = `${NODE_SERVER}/api/extract?${queryStr}&ip=${encodeURIComponent(req.query.ip || '')}&platform=${encodeURIComponent(req.query.platform || 'youtube')}`;
    } else if (action === 'visit') {
        targetUrl = `${NODE_SERVER}/api/visit`;
    } else if (action === 'channel') {
        targetUrl = `${NODE_SERVER}/api/channel?url=${encodeURIComponent(req.query.url || '')}`;
    } else if (action === 'channel-info') {
        targetUrl = `${NODE_SERVER}/api/channel-info?url=${encodeURIComponent(req.query.url || '')}`;
    } else if (action === 'comments') {
        targetUrl = `${NODE_SERVER}/api/comments?url=${encodeURIComponent(req.query.url || '')}&offset=${encodeURIComponent(req.query.offset || '0')}&limit=${encodeURIComponent(req.query.limit || '10')}&pageToken=${encodeURIComponent(req.query.pageToken || '')}`;
    } else if (action === 'comment-replies') {
        targetUrl = `${NODE_SERVER}/api/comment-replies?url=${encodeURIComponent(req.query.url || '')}&parentId=${encodeURIComponent(req.query.parentId || '')}`;
    } else if (action === 'channel-avatar') {
        targetUrl = `${NODE_SERVER}/api/channel-avatar?url=${encodeURIComponent(req.query.url || '')}`;
    } else if (action === 'thumb-base64') {
        targetUrl = `${NODE_SERVER}/api/thumb-base64?url=${encodeURIComponent(req.query.url || '')}`;
    } else if (action === 'nico-comments') {
        targetUrl = `${NODE_SERVER}/api/nico-comments?id=${encodeURIComponent(req.query.id || '')}`;
    } else if (action === 'reviews') {
        targetUrl = `${NODE_SERVER}/api/reviews?deviceId=${encodeURIComponent(req.query.deviceId || '')}`;
    } else if (action === 'review-save') {
        targetUrl = `${NODE_SERVER}/api/review-save?rating=${encodeURIComponent(req.query.rating || '')}&comment=${encodeURIComponent(req.query.comment || '')}&deviceId=${encodeURIComponent(req.query.deviceId || '')}`;
    } else if (action === 'job-start') {
        let query = `url=${encodeURIComponent(req.query.url || '')}&type=${encodeURIComponent(req.query.type || '')}`;
        if (req.query.height) query += `&height=${encodeURIComponent(req.query.height)}`;
        if (req.query.v_id) query += `&v_id=${encodeURIComponent(req.query.v_id)}`;
        if (req.query.a_id) query += `&a_id=${encodeURIComponent(req.query.a_id)}`;
        if (req.query.withComments) query += `&withComments=${encodeURIComponent(req.query.withComments)}`;
        targetUrl = `${NODE_SERVER}/api/job-start?${query}`;
    } else if (action === 'job-progress') {
        targetUrl = `${NODE_SERVER}/api/job-progress?id=${encodeURIComponent(req.query.id || '')}`;
    } else if (action === 'job-cancel') {
        targetUrl = `${NODE_SERVER}/api/job-cancel?id=${encodeURIComponent(req.query.id || '')}`;
        method = 'POST';
    } else if (action === 'job-file') {
        targetUrl = `${NODE_SERVER}/api/job-file?id=${encodeURIComponent(req.query.id || '')}&type=${encodeURIComponent(req.query.type || '')}&download=${encodeURIComponent(req.query.download || '')}`;
    } else if (action === 'proxy') {
        targetUrl = `${NODE_SERVER}/api/proxy?url=${encodeURIComponent(req.query.url || '')}&platform=${encodeURIComponent(req.query.platform || '')}&relayBase=${encodeURIComponent(req.query.relayBase || '')}`;
    }

    if (!targetUrl) return res.status(400).json({ error: 'Invalid action' });

    const client = targetUrl.startsWith('https:') ? https : http;
    const options = { method, headers: {} };

    // Range要求を渡し、動画の途中からの再生・取得を維持する。
    if (req.headers.range) options.headers.Range = req.headers.range;

    const proxyReq = client.request(targetUrl, options, proxyRes => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });

    proxyReq.on('error', err => {
        console.error('Proxy Error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Server Error' });
    });

    proxyReq.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Render Proxy running on port ${PORT}`));
