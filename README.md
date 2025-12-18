# Codex Web

English | [简体中文](README.zh-CN.md)

Self-hosted web UI + relay server for the `codex` CLI.

- Web UI: a Workspace (repo picker) + an in-browser terminal that runs Codex inside your repos.
- API: REST endpoints you can call from scripts (cookie auth).

## Install prerequisites
1. Install Node.js
   - Node.js 18+ (recommended 20+)
   - Verify: `node -v`
2. Install the Codex CLI
   - Install: `npm install -g @openai/codex@latest`
   - Verify: `codex --version`
   - If `codex` isn’t found, restart your terminal (or ensure your global npm bin is on `PATH`).

## Quickstart (local)
1. Create env
   - `cp .env.example .env`
   - Edit `.env`:
     - `LOGIN_USERNAME` / `LOGIN_PASSWORD`: used for the web login
     - `SESSION_SECRET`: long random string (don’t reuse passwords)
     - `REPO_ROOT`: folder that contains your repos (the Workspace list + safety boundary)
2. Install deps
   - `npm install`
3. Run dev
   - `npm run dev`
4. Open
   - UI: `http://localhost:5173` (Vite dev server; proxies `/api/*` to the backend)
   - API: `http://localhost:8788`

## Production
1. `npm install`
2. `npm run build`
3. `npm start`
4. Visit `http://localhost:8788`

## Environment
Edit `.env` (see `.env.example`).

- `LOGIN_USERNAME`, `LOGIN_PASSWORD`: login for the browser UI (cookie-based session)
- `SESSION_SECRET`: used to derive the session token (make it long/random)
- `REPO_ROOT`: directory containing the repos you want in the Workspace list (and the only place terminals are allowed to start)

## Cloudflare Tunnel (recommended for remote access)
Expose the backend server (not Vite dev server) via `http://localhost:8788`.

### Step 1: Install `cloudflared`
macOS (Homebrew):
```bash
brew install cloudflare/cloudflare/cloudflared
```

Linux/Windows:
- Install from Cloudflare’s `cloudflared` docs (package varies by distro).

Verify:
```bash
cloudflared --version
```

### Step 2A: Quick temporary URL (no domain)
This is the fastest way to test remote access:
```bash
cloudflared tunnel --url http://localhost:8788
```
Cloudflare prints a public URL; open it and sign in with your `LOGIN_USERNAME`/`LOGIN_PASSWORD`.

### Step 2B: Custom domain (recommended)
You need a domain that you can point to Cloudflare (change nameservers or DNS).

If you don’t have a domain, you can get a free one from:
```text
https://dpdns.org/
```
After you have a domain, add it to Cloudflare and make sure DNS is managed by Cloudflare for that zone.

#### 1) Add your domain to Cloudflare DNS
1. Create a Cloudflare account
2. Cloudflare Dashboard → **Add a site**
3. Follow the instructions to update nameservers at your domain provider (this can take time to propagate)

#### 2) Create a named tunnel
1. Authenticate:
```bash
cloudflared tunnel login
```
2. Create the tunnel:
```bash
cloudflared tunnel create codex-web
```
3. Route DNS (choose your hostname):
```bash
cloudflared tunnel route dns codex-web codex.your-domain.com
```
4. Create `~/.cloudflared/config.yml`:
```yml
tunnel: <TUNNEL_ID>
credentials-file: /path/to/<TUNNEL_ID>.json

ingress:
  - hostname: codex.your-domain.com
    service: http://localhost:8788
  - service: http_status:404
```
5. Run:
```bash
cloudflared tunnel run codex-web
```

#### 3) (Optional) Protect it with Cloudflare Access (SSO/2FA)
Even though Codex Web has its own login, Cloudflare Access is a good extra layer.
In Cloudflare Zero Trust:
1. Access → Applications → Add an application (Self-hosted)
2. Set the hostname (e.g. `codex.your-domain.com`)
3. Add an allow policy (your email / your team / etc.)

## API (for iOS Shortcuts / scripts)
All `/api/*` endpoints require a browser session cookie (via `POST /api/login`).

Endpoints:
- `GET /api/health` (auth check)
- `GET /api/repos` (repos under `REPO_ROOT`)
- Terminal:
  - `POST /api/terminal/start` `{ "path": "/abs/path/to/repo" }`
  - `GET /api/terminal/:id/stream` (SSE)
  - `POST /api/terminal/:id/input` `{ "data": "ls", "enter": true }`
  - `POST /api/terminal/:id/stop`

## Security notes
- This runs a local automation tool with real filesystem access. Do not expose it publicly without strong auth (Cloudflare Access recommended).
- Use a strong `LOGIN_PASSWORD` and a long random `SESSION_SECRET`.
