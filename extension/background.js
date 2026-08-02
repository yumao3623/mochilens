const BACKEND_URL = "https://mochilens-api.onrender.com";
const MAX_SAMPLE_SECONDS = 9;
const audioJobs = new Map();
let creatingOffscreenDocument = null;

function publicJob(job) {
  if (!job) {
    return { status: "idle" };
  }

  return {
    status: job.status,
    videoId: job.videoId,
    elapsedSeconds: job.elapsedSeconds || 0,
    durationSeconds: job.sampleDurationSeconds,
    currentSegment: job.currentSegment || 0,
    segmentCount: job.segments?.length || 0,
    transcript: job.transcript || "",
    model: job.model || "",
    error: job.error || ""
  };
}

function notifyPopup(job) {
  chrome.runtime
    .sendMessage({
      target: "popup",
      type: "AUDIO_TRANSCRIPTION_UPDATE",
      job: publicJob(job)
    })
    .catch(() => {});
}

async function hasOffscreenDocument() {
  if (chrome.runtime.getContexts) {
    const offscreenUrl = chrome.runtime.getURL("offscreen.html");
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl]
    });
    return contexts.length > 0;
  }

  const clients = await self.clients.matchAll();
  return clients.some((client) => client.url.includes("offscreen.html"));
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    return;
  }

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA", "BLOBS"],
      justification: "Record audio from the user-selected YouTube tab for transcription."
    });
  }

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

async function restorePlayback(job) {
  if (!job?.tabId) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(job.tabId, {
      type: "RESTORE_AUDIO_CAPTURE_PLAYBACK",
      videoId: job.videoId
    });
  } catch {
    // The tab may have been closed or navigated while transcription was running.
  }
}

function validateSampleSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0 || segments.length > 3) {
    throw new Error("音频采样片段配置无效。");
  }

  const normalized = segments.map((segment) => ({
    label: String(segment?.label || "片段"),
    startSeconds: Number(segment?.startSeconds),
    durationSeconds: Number(segment?.durationSeconds)
  }));
  const invalid = normalized.some(
    (segment) =>
      !Number.isFinite(segment.startSeconds) ||
      segment.startSeconds < 0 ||
      !Number.isFinite(segment.durationSeconds) ||
      segment.durationSeconds <= 0 ||
      segment.durationSeconds > 3
  );
  const totalSeconds = normalized.reduce(
    (total, segment) => total + segment.durationSeconds,
    0
  );

  if (invalid || totalSeconds > MAX_SAMPLE_SECONDS) {
    throw new Error("音频采样最多允许 3 个片段、每段 3 秒。 ");
  }

  return { segments: normalized, totalSeconds };
}

async function captureAudioSegments(job) {
  if (job.samplingStarted) {
    return;
  }

  job.samplingStarted = true;

  try {
    for (const [index, segment] of job.segments.entries()) {
      if (job.status !== "capturing") {
        return;
      }

      job.currentSegment = index + 1;
      notifyPopup(job);
      const response = await chrome.tabs.sendMessage(job.tabId, {
        type: "PLAY_AUDIO_CAPTURE_SEGMENT",
        videoId: job.videoId,
        segment
      });

      if (!response?.ok) {
        throw new Error(response?.error || `无法播放${segment.label}采样片段。`);
      }

      job.elapsedSeconds = Math.min(
        job.sampleDurationSeconds,
        job.elapsedSeconds + segment.durationSeconds
      );
      notifyPopup(job);
    }

    await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "STOP_AUDIO_CAPTURE",
      captureId: job.captureId
    });
  } catch (error) {
    job.status = "error";
    job.error = error?.message || "音频分段采样失败。";
    notifyPopup(job);
    restorePlayback(job);
    chrome.runtime
      .sendMessage({
        target: "offscreen",
        type: "ABORT_AUDIO_CAPTURE",
        captureId: job.captureId,
        error: job.error
      })
      .catch(() => {});
  }
}

async function startAudioJob(message) {
  const { segments, totalSeconds } = validateSampleSegments(message.segments);

  if (
    !Number.isInteger(message.tabId) ||
    typeof message.videoId !== "string" ||
    !message.videoId
  ) {
    throw new Error("当前标签页或视频信息无效。");
  }

  const runningJob = [...audioJobs.values()].find((job) =>
    ["preparing", "capturing", "uploading"].includes(job.status)
  );

  if (runningJob) {
    throw new Error("已有视频正在进行音频识别，请等待完成或先取消。 ");
  }

  const captureId = crypto.randomUUID();
  const job = {
    captureId,
    tabId: message.tabId,
    videoId: message.videoId,
    segments,
    sampleDurationSeconds: totalSeconds,
    elapsedSeconds: 0,
    currentSegment: 0,
    samplingStarted: false,
    status: "preparing",
    transcript: "",
    model: "",
    error: ""
  };

  audioJobs.set(job.videoId, job);
  notifyPopup(job);

  try {
    await ensureOffscreenDocument();
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: job.tabId
    });

    const response = await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "START_AUDIO_CAPTURE",
      captureId,
      streamId,
      videoId: job.videoId,
      sampleDurationSeconds: job.sampleDurationSeconds,
      backendUrl: BACKEND_URL
    });

    if (!response?.ok) {
      throw new Error(response?.error || "无法启动标签页音频捕获。");
    }
  } catch (error) {
    job.status = "error";
    job.error = error?.message || "无法启动标签页音频捕获。";
    notifyPopup(job);
    await restorePlayback(job);
  }

  return publicJob(job);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target === "background" && message.type === "START_AUDIO_TRANSCRIPTION") {
    startAudioJob(message)
      .then((job) => sendResponse({ ok: job.status !== "error", job }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.target === "background" && message.type === "GET_AUDIO_TRANSCRIPTION_STATUS") {
    sendResponse({ ok: true, job: publicJob(audioJobs.get(message.videoId)) });
    return false;
  }

  if (message?.target === "background" && message.type === "CANCEL_AUDIO_TRANSCRIPTION") {
    const job = audioJobs.get(message.videoId);

    if (!job || !["preparing", "capturing", "uploading"].includes(job.status)) {
      sendResponse({ ok: false, error: "当前没有可取消的音频识别任务。" });
      return false;
    }

    chrome.runtime
      .sendMessage({
        target: "offscreen",
        type: "CANCEL_AUDIO_CAPTURE",
        captureId: job.captureId
      })
      .catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  if (message?.target === "background" && message.type === "AUDIO_CAPTURE_UPDATE") {
    const job = audioJobs.get(message.videoId);

    if (!job || job.captureId !== message.captureId) {
      return false;
    }

    const previousStatus = job.status;
    job.status = message.status || job.status;
    if (Number.isFinite(Number(message.elapsedSeconds))) {
      job.elapsedSeconds = Number(message.elapsedSeconds);
    }
    job.transcript = message.transcript || "";
    job.model = message.model || "";
    job.error = message.error || "";

    if (job.status === "capturing" && previousStatus !== "capturing") {
      captureAudioSegments(job);
    }

    if (
      ["complete", "error", "cancelled"].includes(job.status) ||
      (job.status === "uploading" && previousStatus === "capturing")
    ) {
      restorePlayback(job);
    }

    notifyPopup(job);
    return false;
  }

  return false;
});
