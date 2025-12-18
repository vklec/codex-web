# Codex Web（中文说明）

[English](README.md) | 简体中文

`codex` CLI 的自托管 Web 界面 + 本地中转服务。

- Web UI：Workspace（仓库列表）+ 浏览器内终端（在你的仓库目录里运行 Codex）
- API：提供少量 REST 接口（基于 Cookie 登录鉴权）

## 先决条件安装
### 1) 安装 Node.js
- Node.js 18+（推荐 20+）
- 验证：`node -v`

### 2) 安装 Codex CLI
安装：
```bash
npm install -g @openai/codex@latest
```

验证：
```bash
codex --version
```

如果提示找不到 `codex` 命令：
- 重新打开终端
- 或确认你的全局 npm bin 路径已加入 `PATH`

## 本地快速启动（开发模式）
### 1) 创建并配置环境变量
在项目根目录：
```bash
cp .env.example .env
```

编辑 `.env`，至少需要这些变量：
- `LOGIN_USERNAME` / `LOGIN_PASSWORD`：网页登录账号密码
- `SESSION_SECRET`：用来生成会话 token（建议长随机字符串，不要复用密码）
- `REPO_ROOT`：你的“仓库根目录”（Workspace 会列出它下面的目录；同时也是安全边界：终端只允许在该目录内启动）

### 2) 安装依赖
```bash
npm install
```

### 3) 运行开发环境
```bash
npm run dev
```

### 4) 访问
- UI：`http://localhost:5173`（Vite 开发服务器；会把 `/api/*` 代理到后端）
- API：`http://localhost:8788`

## 生产环境部署（单端口）
```bash
npm install
npm run build
npm start
```

访问：`http://localhost:8788`

## 环境变量说明
编辑 `.env`（参考 `.env.example`）。

- `LOGIN_USERNAME`, `LOGIN_PASSWORD`：网页登录（Cookie 会话）
- `SESSION_SECRET`：会话密钥（强烈建议长随机）
- `REPO_ROOT`：Workspace 列表根目录 + 终端允许启动的安全边界

## Cloudflare Tunnel（推荐用于远程访问）
建议把后端服务（不是 Vite）通过 Tunnel 暴露出去：`http://localhost:8788`

### 第 1 步：安装 `cloudflared`
macOS（Homebrew）：
```bash
brew install cloudflare/cloudflare/cloudflared
```

验证：
```bash
cloudflared --version
```

### 第 2A 步：临时公网 URL（无需域名）
最快测试远程访问方式：
```bash
cloudflared tunnel --url http://localhost:8788
```
Cloudflare 会输出一个公网 URL；打开后使用 `LOGIN_USERNAME`/`LOGIN_PASSWORD` 登录即可。

### 第 2B 步：自定义域名（推荐）
你需要一个域名并托管到 Cloudflare（更改 NS 或由 Cloudflare 管理 DNS）。

如果你没有域名，可以在这里申请免费域名：
```text
https://dpdns.org/
```

#### 1) 将域名添加到 Cloudflare
1. 注册/登录 Cloudflare
2. Dashboard → **Add a site**
3. 按提示把域名的 Nameserver 改到 Cloudflare（生效可能需要一段时间）

#### 2) 创建 Named Tunnel
1. 登录授权：
```bash
cloudflared tunnel login
```
2. 创建 Tunnel：
```bash
cloudflared tunnel create codex-web
```
3. 绑定 DNS（把 `codex.your-domain.com` 改成你的子域名）：
```bash
cloudflared tunnel route dns codex-web codex.your-domain.com
```
4. 创建配置文件 `~/.cloudflared/config.yml`：
```yml
tunnel: <TUNNEL_ID>
credentials-file: /path/to/<TUNNEL_ID>.json

ingress:
  - hostname: codex.your-domain.com
    service: http://localhost:8788
  - service: http_status:404
```
5. 运行：
```bash
cloudflared tunnel run codex-web
```

#### 3)（可选）Cloudflare Access 增强保护（SSO/2FA）
即使 Codex Web 自带登录，仍建议再加一层 Cloudflare Access。
在 Cloudflare Zero Trust 中：
1. Access → Applications → Add an application（Self-hosted）
2. 选择 hostname（例如 `codex.your-domain.com`）
3. 配置 Allow policy（你的邮箱/团队等）

## API（给脚本/iOS Shortcuts）
所有 `/api/*` 接口都需要先登录获取 Cookie（`POST /api/login`）。

接口列表：
- `GET /api/health`（鉴权检查）
- `GET /api/repos`（列出 `REPO_ROOT` 下的目录）
- 终端：
  - `POST /api/terminal/start` `{ "path": "/abs/path/to/repo" }`
  - `GET /api/terminal/:id/stream`（SSE）
  - `POST /api/terminal/:id/input` `{ "data": "ls", "enter": true }`
  - `POST /api/terminal/:id/stop`

## 安全提示
- 这是一个会在你本机直接运行自动化工具、并拥有真实文件系统访问权限的服务。不要在缺少强认证/保护的情况下直接公网暴露。
- 强烈建议：Cloudflare Access + 强密码 + 长随机 `SESSION_SECRET`。

