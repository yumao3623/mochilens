let activeCapture = null;

function sendUpdate(capture, status, extra = {}) {
  chrome.runtime
    .sendMessage({
      target: "background",
      type: "AUDIO_CAPTURE_UPDATE",
      captureId: capture.captureId,
      videoId: capture.videoId,
      status,
      ...extra
    })
    .catch(() => {});
}

function selectAudioMimeType() {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find(
    (type) => MediaRecorder.isTypeSupported(type)
  );
}

async function cleanupCapture(capture) {
  window.clearInterval(capture.progressTimer);
  window.clearTimeout(capture.stopTimer);
  capture.stream?.getTracks().forEach((track) => track.stop());

  if (capture.audioContext && capture.audioContext.state !== "closed") {
    await capture.audioContext.close().catch(() => {});
  }

  if (activeCapture?.captureId === capture.captureId) {
    activeCapture = null;
  }
}

async function uploadRecording(capture, blob) {
  sendUpdate(capture, "uploading", {
    elapsedSeconds: capture.sampleDurationSeconds
  });

  let response;

  try {
    response = await fetch(`${capture.backendUrl}/api/transcribe`, {
      method: "POST",
      headers: {
        "Content-Type": blob.type || "audio/webm",
        "X-MochiLens-Video-Id": capture.videoId,
        "X-MochiLens-Audio-Duration": String(capture.sampleDurationSeconds)
      },
      body: blob
    });
  } catch {
    throw new Error("无法连接后端，请确认 PowerShell 中的服务正在运行。");
  }

  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.ok) {
    throw new Error(
      result?.error?.message || `音频转写请求失败（HTTP ${response.status}）。`
    );
  }

  sendUpdate(capture, "complete", {
    elapsedSeconds: capture.sampleDurationSeconds,
    transcript: result.transcript,
    model: result.model || ""
  });
}

async function finishRecording(capture) {
  const blob = new Blob(capture.chunks, {
    type: capture.recorder.mimeType || "audio/webm"
  });

  await cleanupCapture(capture);

  if (capture.cancelled) {
    sendUpdate(capture, "cancelled");
    return;
  }

  if (capture.abortError) {
    sendUpdate(capture, "error", { error: capture.abortError });
    return;
  }

  if (!blob.size) {
    sendUpdate(capture, "error", { error: "没有捕获到标签页音频。" });
    return;
  }

  try {
    await uploadRecording(capture, blob);
  } catch (error) {
    sendUpdate(capture, "error", {
      error: error?.message || "音频转写失败。"
    });
  }
}

async function startCapture(message) {
  if (activeCapture) {
    throw new Error("已有音频捕获任务正在运行。");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: message.streamId
      }
    },
    video: false
  });
  const mimeType = selectAudioMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const audioContext = new AudioContext();
  await audioContext.resume();
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(audioContext.destination);

  const capture = {
    captureId: message.captureId,
    videoId: message.videoId,
    sampleDurationSeconds: message.sampleDurationSeconds,
    backendUrl: message.backendUrl,
    stream,
    recorder,
    audioContext,
    chunks: [],
    startedAt: Date.now(),
    progressTimer: null,
    stopTimer: null,
    cancelled: false,
    abortError: ""
  };

  activeCapture = capture;
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      capture.chunks.push(event.data);
    }
  });
  recorder.addEventListener("stop", () => finishRecording(capture), { once: true });
  recorder.start(1000);

  capture.stopTimer = window.setTimeout(
    () => recorder.state !== "inactive" && recorder.stop(),
    Math.ceil((capture.sampleDurationSeconds + 20) * 1000)
  );

  sendUpdate(capture, "capturing", { elapsedSeconds: 0 });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") {
    return false;
  }

  if (message.type === "START_AUDIO_CAPTURE") {
    startCapture(message)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "CANCEL_AUDIO_CAPTURE") {
    if (!activeCapture || activeCapture.captureId !== message.captureId) {
      sendResponse({ ok: false });
      return false;
    }

    activeCapture.cancelled = true;
    if (activeCapture.recorder.state !== "inactive") {
      activeCapture.recorder.stop();
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "STOP_AUDIO_CAPTURE") {
    if (!activeCapture || activeCapture.captureId !== message.captureId) {
      sendResponse({ ok: false });
      return false;
    }

    if (activeCapture.recorder.state !== "inactive") {
      activeCapture.recorder.stop();
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "ABORT_AUDIO_CAPTURE") {
    if (!activeCapture || activeCapture.captureId !== message.captureId) {
      sendResponse({ ok: false });
      return false;
    }

    activeCapture.abortError = message.error || "音频分段采样失败。";
    if (activeCapture.recorder.state !== "inactive") {
      activeCapture.recorder.stop();
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
