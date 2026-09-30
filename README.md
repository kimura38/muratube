# Render relay

This project publishes the included `public/index.html` and relays its `/api/*`
requests to the existing upstream API. The browser only needs the Render URL.

## Deploy

1. Put this directory in a Git repository and create a Render **Web Service** from it.
2. Render will use `render.yaml`; alternatively use build command `npm install --omit=dev`
   and start command `npm start`.
3. Set `UPSTREAM_BASE_URL` to the existing API base URL (default: `https://mrpvp.net`).
4. Open `https://<your-service>.onrender.com/`. The API URL is filled in
   automatically when the HTML is served by this Render service.

For an HTML file hosted somewhere else (such as a GAS web app), open Settings
and set **Render API URL** to `https://<your-service>.onrender.com`.

`CORS_ORIGINS` can be a comma-separated list of permitted site origins. Leave it
as `*` only while the HTML can be hosted from arbitrary origins.
