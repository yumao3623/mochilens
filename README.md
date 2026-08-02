# MochiLens

MochiLens is a Chrome Extension Manifest V3 video learning assistant developed phase by phase from the provided specification.

## Current status

Phase 8.1 is under user testing. The extension first retrieves YouTube captions. When a video has no caption track, the user can explicitly sample three seconds from the beginning, middle, and end of the tab audio, then transcribe at most nine seconds in total. It then generates an AI summary and answers questions using the resulting text record.

## Load the extension locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `extension` directory in this project.
5. Open the extension from the Chrome toolbar.

When visiting a YouTube page, the content script writes `[MochiLens] Content script loaded.` to the page's developer console.

## Run the Phase 8.1 backend

1. Open a terminal in the `backend` directory.
2. Copy `.env.example` to `.env`, set an official OpenAI `OPENAI_API_KEY`, and choose supported `OPENAI_MODEL` and `OPENAI_TRANSCRIBE_MODEL` values. The backend connects only to the official `api.openai.com` service.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://127.0.0.1:3000/api/health` and confirm that `openaiConfigured` is `true`.
6. Open `http://127.0.0.1:3000/api/ai-health` to verify the network connection, API key, and configured model. A successful response has `ok: true` and `reachable: true`.

The default text model is `gpt-5.6-luna` with low reasoning effort for a cost-sensitive, latency-aware production baseline. Audio transcription uses `gpt-4o-mini-transcribe`. These values can be changed through `.env` without editing source code.

The backend connects directly to the official OpenAI API. Keep the API key only in `backend/.env`; never place it in extension files or commit it to source control.

For hosted deployments, the backend listens on `0.0.0.0` and uses the platform-provided `PORT`. Keep `OPENAI_API_KEY` in the hosting platform's secret-variable settings; never upload the local `.env` file.

`POST /api/summarize` returns `summary` and `keyPoints`. `POST /api/chat` accepts `transcript` and `question`, then returns an `answer` grounded in the transcript.

`POST /api/transcribe` accepts a raw WebM, Ogg, MP4, or MP3 audio body and returns `transcript`. Tab audio capture only starts after the user clicks the fallback button, never accesses the microphone, and samples at most nine seconds in Phase 8.1.

On this Windows development machine, run `backend\start-local.cmd`. The helper uses the installed Node.js executable and the local Clash proxy at `127.0.0.1:7890`. The normal `npm start` command remains proxy-free for future hosted deployments.

## Run automated tests

From the `backend` directory, run `npm.cmd test`. The test suite uses mock AI services, does not call the configured provider, and does not consume API credits.
