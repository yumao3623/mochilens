# MochiLens

MochiLens is a Chrome Extension Manifest V3 video learning assistant developed phase by phase from the provided specification.

## Current status

Phase 8.1 is under user testing. The extension first retrieves YouTube captions. When a video has no caption track, the user can explicitly sample three seconds from the beginning, middle, and end of the tab audio, then transcribe at most nine seconds in total. It then generates an AI summary and answers questions using the resulting text record.

The extension validates the backend phase and AI provider before enabling video processing. This prevents a stale deployment from silently serving a different AI provider.

## Load the extension locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `extension` directory in this project.
5. Open the extension from the Chrome toolbar.

When visiting a YouTube page, the content script writes `[MochiLens] Content script loaded.` to the page's developer console.

## Run the Phase 8.1 backend

1. Open a terminal in the `backend` directory.
2. Copy `.env.example` to `.env`. Add the Alibaba Cloud Model Studio API Key and the China (Beijing) API Host shown when that key was created. Never place either value in the extension.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://127.0.0.1:3000/api/health` and confirm that `bailianConfigured` is `true`.
6. Open `http://127.0.0.1:3000/api/ai-health` to verify the network connection, API key, and configured model. A successful response has `ok: true` and `reachable: true`.

The default text model is `qwen3.7-flash`. Audio transcription uses `qwen3-asr-flash`, and `qwen3.5-omni-flash` is reserved for a later visual-analysis phase. These values can be changed through `.env` without editing source code.

The backend connects directly to the Alibaba Cloud Model Studio endpoint configured in `BAILIAN_API_HOST`. It uses the existing OpenAI-compatible Node client only as a protocol library; no request is sent to `api.openai.com`. Keep the API key only in `backend/.env`; never place it in extension files or commit it to source control.

For hosted deployments, the backend listens on `0.0.0.0` and uses the platform-provided `PORT`. Keep `BAILIAN_API_KEY` and `BAILIAN_API_HOST` in the hosting platform's secret-variable settings; never upload the local `.env` file.

The repository-root `render.yaml` defines a reproducible free Render Web Service. After deploying, run `npm run check:release` from `backend`; it verifies that the extension permission, backend phase, provider, configuration state, and live endpoint agree. Set `SKIP_REMOTE_HEALTH=1` only in CI or when intentionally checking repository files without contacting production.

`POST /api/summarize` returns `summary` and `keyPoints`. `POST /api/chat` accepts `transcript` and `question`, then returns an `answer` grounded in the transcript.

`POST /api/transcribe` accepts a raw WebM, Ogg, MP4, or MP3 audio body and returns `transcript`. Tab audio capture only starts after the user clicks the fallback button, never accesses the microphone, and samples at most nine seconds in Phase 8.1.

On Windows, run `backend\start-local.cmd`. The helper finds Node.js 24 or newer from `PATH` and does not require Clash, a VPN, or a local proxy to reach the China (Beijing) endpoint.

## Run automated tests

From the `backend` directory, run `npm.cmd test`. The test suite uses mock AI services, does not call the configured provider, and does not consume API credits.

See `docs/TEST_MATRIX.md` for real-browser acceptance tests, `docs/RENDER_DEPLOYMENT.md` for zero-cost backend deployment, and `docs/RELEASE_PLAN.md` for the path from local testing to Chrome Web Store publication.
