# MochiLens 发布计划

本文档把 Phase 8.1 从当前开发分支推进到 Chrome Web Store 正式发布。每个阶段都有明确出口；未满足出口条件时不进入下一阶段。

推荐节奏：Stage 0 用 1 天，Stage 1 用 2 至 3 天，Stage 2 用 1 至 2 周，Stage 3 用 3 至 5 天。商店审核时间不可控，Stage 4 不承诺固定天数。

## Stage 0：代码与部署对齐（当前）

目标：让仓库、Render 和扩展使用同一版百炼后端。

- 将 `codex/render-backend` 合并到 `main`。
- 在 Render 服务中使用仓库根目录的 `render.yaml`。
- 在 Render 控制台设置 `BAILIAN_API_KEY` 和 `BAILIAN_API_HOST`，不要提交真实值。
- 部署后运行 `npm run check:release`。
- 确认 `/api/health` 返回正确的 `contractVersion`、`aiProvider: aliyun-bailian`、`bailianConfigured: true`，并记录 `revision`。

出口：远端发布检查通过，旧 OpenAI 后端不再被扩展调用。

成本：后端可保持 0 元；继续使用 Render Free Web Service 和已有百炼额度。具体操作见 `docs/RENDER_DEPLOYMENT.md`。

## Stage 1：本地功能验收

目标：证明核心链路在真实 Chrome 和真实 YouTube 页面可用。

- 使用 `chrome://extensions` 加载 `extension` 目录。
- 按 `docs/TEST_MATRIX.md` 至少完成一轮全部 P0 用例。
- 在英文、中文、人工字幕、自动字幕和无字幕视频上验证。
- 确认音频采集只在点击按钮后发生，时长不超过 9 秒，且不会使用麦克风。
- 连续使用 30 分钟，记录失败请求、响应时间和百炼消耗。

出口：P0 用例全部通过，没有阻塞级缺陷。

成本：0 元；不需要 Chrome Web Store 开发者账号。

## Stage 2：零成本小范围内测

目标：不注册商店账号、不购买服务器，先收集真实反馈。

- 使用 Render Free Web Service；接受闲置后冷启动约一分钟的限制。
- 将扩展目录打包为 ZIP，仅发给 3 至 5 位明确同意参与测试的人。
- 测试者通过开发者模式“加载已解压的扩展程序”安装。
- 每周检查 Render 用量与百炼账单，设置百炼额度/告警。
- 不做公开传播；当前 API 尚无用户身份和持久化限流，不适合不受控流量。

出口：累计至少 20 次完整会话、5 个不同视频、无密钥泄露或异常费用。

成本：后端 0 元；百炼按实际使用量计算，先设低额度告警。

## Stage 3：发布候选版

目标：补齐公开发布需要的安全、隐私和商店材料。

- 增加服务端限流、请求日志脱敏、费用熔断和异常告警。
- 明确字幕、音频样本、问题是否保存；默认不保存，并写入隐私政策。
- 准备商店图标、截图、短描述、详细描述、支持邮箱和隐私政策 URL。
- 复查 Manifest 权限，只保留 `activeTab`、`offscreen`、`tabCapture` 和必要域名。
- 固定版本号，生成 ZIP，执行完整测试与 `npm run check:release`。
- 评估免费后端冷启动是否可接受；不可接受时再升级付费常驻实例。

出口：发布清单全部完成，候选 ZIP 在干净 Chrome Profile 中通过验收。

购买决策点：只有数据证明免费实例冷启动明显影响留存时，才购买常驻后端；在此之前不升级。

## Stage 4：Chrome Web Store 提交

目标：完成正式发布。

- 创建专用 Google 账号并注册 Chrome Web Store 开发者账号。
- 支付 Google 要求的一次性注册费并完成身份/联系信息设置。
- 首次建议选择 Unlisted 或受控测试，审核通过并稳定一周后再切 Public。
- 提交后每天检查审核通知、崩溃反馈、Render 与百炼用量。

出口：商店版本可安装，线上 API 健康，核心链路通过烟雾测试。

成本：需要 Google 要求的一次性 Chrome Web Store 开发者注册费；实际金额和可用支付方式以注册页面为准。无需购买 Google Cloud 服务。

## Stage 5：正式上线后一周

目标：安全扩大流量，而不是立即开发 Phase 8.2。

- 先修复 P0/P1 问题，监控成功率、P95 响应时间和单次会话成本。
- 建立回滚步骤：保留上一个扩展 ZIP，并使用 Render 最近部署回滚。
- 达到稳定指标后，再评估 Phase 8.2 视觉分析。

建议准入指标：字幕解析成功率不低于 90%，AI 请求成功率不低于 95%，无未授权音频采集，无异常费用事件。
