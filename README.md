# muratube Render relay

これは独立した動画取得サーバーではありません。Render は画面と公開 URL の窓口だけを担い、既存のあなたのサーバー（以下「上流サーバー」）へリクエストを中継します。

```
Browser → https://<Render service> → https://<your existing server>
                                      → Googlevideo / other upstream sources
```

ブラウザに返す API データからは、上流サーバー・YouTube・ニコニコ・画像配信元の URL を除去します。動画・音声・字幕・サムネイルはすべて Render の `/media/<token>` URL に置き換え、Render が上流サーバーの `/api/proxy` を通して取得します。iframe は使いません。

## デプロイ

1. このフォルダを Git リポジトリのルートに置き、Render で Blueprint として接続します。
2. Render の環境変数 `UPSTREAM_ORIGIN` に、現在動かしているサーバーの公開 URL を設定します。例: `https://api.example.com`
3. 上流サーバーが Render から HTTPS で到達可能であることを確認します。`localhost`、LAN 内 IP、認証が必要な URL は使用できません。

既存サーバーはそのまま使います。必要な API は `/api/search`、`/api/recommend`、`/api/channel`、`/api/extract`、`/api/comments`、`/api/proxy`、ダウンロード関連 API です。

## 制約

- URL の短期トークンは Render の再起動後・2時間後に失効します。その場合は検索し直してください。
- Render から上流サーバーまでの通信を許可する必要があります。上流サーバーを一般公開できない場合は、VPN、Cloudflare Tunnel、Tailscale Funnel など別途公開経路が必要です。
- Content Security Policy で iframe と外部の画像・動画・接続を禁止しています。ブラウザからは Render の URL だけが読み込まれます。
