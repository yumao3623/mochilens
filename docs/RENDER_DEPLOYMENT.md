# Render 免费后端迁移手册

当前扩展地址为 `https://mochilens-api.onrender.com`。不要新购服务器；Phase 8.1 内测可以继续使用 Render Free Web Service。

## 1. 先让代码进入部署分支

1. 确认测试通过：在 `backend` 运行 `npm test`。
2. 将 `codex/render-backend` 合并到 `main` 并推送 GitHub。
3. 确认 GitHub Actions 的 Test 工作流通过。

## 2. 对齐现有 Render 服务

在 Render Dashboard 打开 `mochilens-api`，核对以下设置：

| 设置 | 值 |
| --- | --- |
| Repository | `yumao3623/mochilens` |
| Branch | `main` |
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `corepack enable && pnpm install --frozen-lockfile` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Instance Type | Free（仅内测） |

也可以在 Render 中创建/同步仓库根目录的 `render.yaml` Blueprint。不要同时维护两套互相冲突的设置。

## 3. 设置秘密变量

从本机 `backend/.env` 复制值到 Render 的 Environment 页面。不要在聊天、截图、Issue 或 Git 中粘贴真实值。

- `BAILIAN_API_KEY`
- `BAILIAN_API_HOST`

模型变量已经写在 `render.yaml`；如果现有服务不是 Blueprint 管理，请同时设置：

- `BAILIAN_TEXT_MODEL=qwen3.7-flash`
- `BAILIAN_TRANSCRIBE_MODEL=qwen3-asr-flash`
- `BAILIAN_OMNI_MODEL=qwen3.5-omni-flash`
- `HOST=0.0.0.0`

删除不再使用的 `OPENAI_API_KEY`、`OPENAI_MODEL` 等旧变量，避免以后误判实际供应商。

## 4. 部署与验证

1. 触发 Deploy latest commit，等待健康检查通过。
2. 打开 `https://mochilens-api.onrender.com/api/health`。
3. 确认 `contractVersion`、`revision`、`aiProvider: aliyun-bailian` 和 `bailianConfigured: true`。
4. 打开 `/api/ai-health`，确认 `reachable: true`。
5. 在本机 `backend` 运行 `npm run check:release`。

发布门禁通过后，才在 Chrome 中重新加载扩展并开始验收。

## 5. 免费实例预期

Render Free Web Service 闲置后会休眠，首次请求可能需要约一分钟。这个体验适合开发和小范围内测，不作为正式公开版的性能承诺。内测阶段先记录冷启动、请求成功率和实际流量，再决定是否购买常驻实例。
