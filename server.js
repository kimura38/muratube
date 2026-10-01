const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');

const app = express();

// HTMLから直接アクセスできるようにCORSを許可
app.use(cors());

// メインサーバーのURL
const NODE_SERVER = process.env.NODE_SERVER || "https://xweb.hospitaldelninodif.gob.mx";

// すべてのリクエストを受け取る
app.use('/', (req, res) => {
    const action = req.query.action;
    let targetUrl = "";
    let method = 'GET';

    // クエリからメインサーバーのURLを組み立てる
    if (action === "search") {
        targetUrl = `${NODE_SERVER}/api/search?q=${encodeURIComponent(req.query.q || '')}&platform=${req.query.platform || 'youtube'}`;
    } else if (action === "recommend") {
        targetUrl = `${NODE_SERVER}/api/recommend?platform=${req.query.platform || 'youtube'}`;
    } else if (action === "extract") {
        // extractは url と id どちらも対応できるようにする
        let queryStr = req.query.id ? `id=${req.query.id}` : `url=${encodeURIComponent(req.query.url || '')}`;
        targetUrl = `${NODE_SERVER}/api/extract?${queryStr}&ip=${req.query.ip || ''}`;
    } else if (action === "visit") {
        targetUrl = `${NODE_SERVER}/api/visit`;
    } else if (action === "channel") {
        targetUrl = `${NODE_SERVER}/api/channel?url=${encodeURIComponent(req.query.url || '')}`;
    } else if (action === "comments") {
        targetUrl = `${NODE_SERVER}/api/comments?url=${encodeURIComponent(req.query.url || '')}`;
    } else if (action === "thumb-base64") {
        targetUrl = `${NODE_SERVER}/api/thumb-base64?url=${encodeURIComponent(req.query.url || '')}`;
    } else if (action === "job-start") {
        let q = `url=${encodeURIComponent(req.query.url || '')}&type=${req.query.type}`;
        if (req.query.height) q += `&height=${req.query.height}`;
        targetUrl = `${NODE_SERVER}/api/job-start?${q}`;
    } else if (action === "job-progress") {
        targetUrl = `${NODE_SERVER}/api/job-progress?id=${req.query.id}`;
    } else if (action === "job-cancel") {
        // ※メインサーバー側の job-cancel は POST メソッドなので合わせる
        targetUrl = `${NODE_SERVER}/api/job-cancel?id=${req.query.id}`;
        method = 'POST'; 
    } 
    // ▼ここから下を追加（動画ファイルやメディアの中継用）
    else if (action === "job-file") {
        targetUrl = `${NODE_SERVER}/api/job-file?id=${req.query.id}&type=${req.query.type}`;
    } else if (action === "proxy") {
        targetUrl = `${NODE_SERVER}/api/proxy?url=${encodeURIComponent(req.query.url || '')}`;
    }

    // 対応するアクションがない場合
    if (!targetUrl) {
        return res.status(400).json({ error: "Invalid action" });
    }

    // ---------------------------------------------------
    // ストリーミング中継処理（GASにはできない部分）
    // ---------------------------------------------------
    const client = targetUrl.startsWith('https') ? https : http;
    
    const options = {
        method: method,
        headers: {}
    };

    // ブラウザから「動画の途中から読み込みたい(Range)」という要求が来たら、そのままメインサーバーへ伝える
    if (req.headers.range) {
        options.headers['Range'] = req.headers.range;
    }

    // メインサーバーへリクエスト
    const proxyReq = client.request(targetUrl, options, (proxyRes) => {
        // メインサーバーから返ってきたヘッダー（ファイルサイズや型など）をそのままブラウザにセット
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        
        // 動画などの巨大なデータを、メモリに溜め込まずに「土管」のようにそのままブラウザへ流し込む（pipe）
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error("Proxy Error:", err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: "Server Error" });
        }
    });

    proxyReq.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Render Proxy running on port ${PORT}`));
