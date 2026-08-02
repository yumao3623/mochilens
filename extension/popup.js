const elements = {
  status: document.querySelector("#video-status"),
  details: document.querySelector("#video-details"),
  title: document.querySelector("#video-title"),
  transcriptStatus: document.querySelector("#transcript-status"),
  transcriptButton: document.querySelector("#load-transcript"),
  audioFallback: document.querySelector("#audio-fallback"),
  audioFallbackText: document.querySelector("#audio-fallback-text"),
  audioButton: document.querySelector("#start-audio-transcription"),
  transcriptOutput: document.querySelector("#transcript-output"),
  transcriptMeta: document.querySelector("#transcript-meta"),
  transcriptDetails: document.querySelector("#transcript-details"),
  transcriptText: document.querySelector("#transcript-text"),
  transcriptDebug: document.querySelector("#transcript-debug"),
  transcriptDebugText: document.querySelector("#transcript-debug-text"),
  summaryStatus: document.querySelector("#summary-status"),
  summaryButton: document.querySelector("#generate-summary"),
  summaryOutput: document.querySelector("#summary-output"),
  summaryText: document.querySelector("#summary-text"),
  keyPoints: document.querySelector("#key-points"),
  question: document.querySelector("#question"),
  questionCount: document.querySelector("#question-count"),
  chatStatus: document.querySelector("#chat-status"),
  chatButton: document.querySelector("#send-question"),
  chatOutput: document.querySelector("#chat-output"),
  answerText: document.querySelector("#answer-text")
};

const BACKEND_URL = "http://127.0.0.1:3000";
let lastVideoSignature = "";
let refreshRequestId = 0;
let summaryRequestId = 0;
let chatRequestId = 0;
let activeTabId = null;
let currentVideoId = "";
let currentTranscript = "";
let chatRequestInProgress = false;
let audioJobInProgress = false;

function setButtonLoading(button, loading, defaultText, loadingText) {
  button.textContent = loading ? loadingText : defaultText;
  button.classList.toggle("is-loading", loading);
  button.setAttribute("aria-busy", String(loading));
}

function updateQuestionControls() {
  const questionLength = elements.question.value.length;
  const transcriptAvailable = Boolean(currentTranscript);

  elements.questionCount.textContent = `${questionLength} / 2000`;
  elements.question.disabled = !transcriptAvailable || chatRequestInProgress;
  elements.chatButton.disabled =
    !transcriptAvailable ||
    chatRequestInProgress ||
    elements.question.value.trim().length === 0;
}

function showStatus(message, type = "info") {
  elements.status.textContent = message;
  elements.status.dataset.type = type;
}

function resetTranscript(videoAvailable) {
  currentTranscript = "";
  elements.transcriptButton.disabled = !videoAvailable;
  elements.transcriptOutput.hidden = true;
  elements.transcriptMeta.textContent = "";
  elements.transcriptDetails.open = false;
  elements.transcriptText.textContent = "";
  elements.transcriptDebug.hidden = true;
  elements.transcriptDebug.open = false;
  elements.transcriptDebugText.textContent = "";
  elements.audioFallback.hidden = true;
  elements.audioFallbackText.textContent =
    "未找到 YouTube 字幕。可在你确认后采集开头、中间、结尾各 3 秒音频并使用 AI 转成文字；不会读取麦克风。";
  audioJobInProgress = false;
  elements.audioButton.disabled = false;
  setButtonLoading(elements.audioButton, false, "使用音频识别", "准备中...");
  elements.transcriptStatus.textContent = videoAvailable
    ? "解析视频内容后，可以查看视频字幕。"
    : "识别视频后即可解析内容。";
  elements.transcriptStatus.dataset.type = "info";
  setButtonLoading(elements.transcriptButton, false, "解析视频", "解析中...");
  resetSummary(false);
  resetChat(false);
}

function resetSummary(transcriptAvailable) {
  summaryRequestId += 1;
  elements.summaryButton.disabled = !transcriptAvailable;
  elements.summaryOutput.hidden = true;
  elements.summaryText.textContent = "";
  elements.keyPoints.replaceChildren();
  elements.summaryStatus.textContent = transcriptAvailable
    ? "点击按钮生成视频总结。"
    : "解析视频后可生成总结。";
  elements.summaryStatus.dataset.type = "info";
  setButtonLoading(elements.summaryButton, false, "生成总结", "生成中...");
}

function resetChat(transcriptAvailable) {
  chatRequestId += 1;
  chatRequestInProgress = false;
  if (!transcriptAvailable) {
    elements.question.value = "";
  }
  elements.chatOutput.hidden = true;
  elements.answerText.textContent = "";
  elements.chatStatus.textContent = transcriptAvailable
    ? "输入与当前视频有关的问题。"
    : "解析视频后可以针对视频提问。";
  elements.chatStatus.dataset.type = "info";
  setButtonLoading(elements.chatButton, false, "发送问题", "回答中...");
  updateQuestionControls();
}

function showVideoInfo(video) {
  const videoChanged = video.videoId !== currentVideoId;
  const signature = `${video.videoId}\n${video.title}\n${video.url}`;

  currentVideoId = video.videoId;

  if (videoChanged) {
    resetTranscript(true);
  }

  if (signature === lastVideoSignature) {
    return videoChanged;
  }

  lastVideoSignature = signature;
  elements.title.textContent = video.title;
  elements.details.hidden = false;
  showStatus("视频已识别", "success");
  return videoChanged;
}

function getVideoId(url) {
  if (url.pathname === "/watch") {
    return url.searchParams.get("v");
  }

  const pathMatch = url.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/);
  return pathMatch?.[1] || null;
}

function getVideoInfoFromTab(tab) {
  if (!tab.url) {
    return null;
  }

  const url = new URL(tab.url);
  const isYouTube = /(^|\.)youtube\.com$/.test(url.hostname);
  const videoId = isYouTube ? getVideoId(url) : null;

  if (!videoId) {
    return null;
  }

  return {
    isYouTubeVideo: true,
    url: url.href,
    videoId,
    title: tab.title?.replace(/\s*-\s*YouTube\s*$/, "").trim() || "未获取到标题"
  };
}

function showTranscript(response) {
  const isAudioTranscription = response.sourceType === "audio-transcription";
  const source = isAudioTranscription
    ? "AI 语音转写"
    : response.isAutoGenerated
      ? "自动生成字幕"
      : "人工字幕";
  const language = isAudioTranscription
    ? "自动识别语言"
    : response.languageName || response.languageCode || "未知语言";

  elements.transcriptMeta.textContent = isAudioTranscription
    ? `${language} · ${source}`
    : `${language} · ${source} · ${response.segmentCount} 个片段`;
  elements.transcriptText.textContent = response.transcript;
  elements.transcriptDetails.open = false;
  elements.transcriptOutput.hidden = false;
  elements.transcriptStatus.textContent = "视频解析完成。";
  elements.transcriptStatus.dataset.type = "success";
  elements.transcriptDebug.hidden = true;
  elements.audioFallback.hidden = true;
  audioJobInProgress = false;
  currentTranscript = response.transcript;
  resetSummary(true);
  resetChat(true);
}

function showSummary(response) {
  elements.summaryText.textContent = response.summary;
  elements.keyPoints.replaceChildren(
    ...response.keyPoints.map((point) => {
      const item = document.createElement("li");
      item.textContent = point;
      return item;
    })
  );
  elements.summaryOutput.hidden = false;
  elements.summaryStatus.textContent = "总结生成成功。";
  elements.summaryStatus.dataset.type = "success";
}

function appendInlineFormatting(element, text) {
  const boldPattern = /\*\*([^*]+)\*\*/g;
  let currentIndex = 0;
  let match;

  while ((match = boldPattern.exec(text)) !== null) {
    if (match.index > currentIndex) {
      element.append(document.createTextNode(text.slice(currentIndex, match.index)));
    }

    const strong = document.createElement("strong");
    strong.textContent = match[1];
    element.append(strong);
    currentIndex = boldPattern.lastIndex;
  }

  if (currentIndex < text.length) {
    element.append(document.createTextNode(text.slice(currentIndex)));
  }
}

function renderAnswer(answer) {
  elements.answerText.replaceChildren();
  let activeList = null;

  for (const rawLine of answer.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      activeList = null;
      continue;
    }

    const orderedItem = line.match(/^\d+[.)]\s+(.+)$/);
    const unorderedItem = line.match(/^[-*]\s+(.+)$/);
    const listType = orderedItem ? "ol" : unorderedItem ? "ul" : null;

    if (listType) {
      if (!activeList || activeList.tagName.toLowerCase() !== listType) {
        activeList = document.createElement(listType);
        elements.answerText.append(activeList);
      }

      const item = document.createElement("li");
      appendInlineFormatting(item, (orderedItem || unorderedItem)[1]);
      activeList.append(item);
      continue;
    }

    activeList = null;
    const paragraph = document.createElement("p");
    appendInlineFormatting(paragraph, line.replace(/^#{1,3}\s+/, ""));
    elements.answerText.append(paragraph);
  }
}

function showAnswer(response) {
  renderAnswer(response.answer);
  elements.question.value = "";
  updateQuestionControls();
  elements.chatOutput.hidden = false;
  elements.chatStatus.textContent = "回答生成成功。";
  elements.chatStatus.dataset.type = "success";
}

async function sendQuestion() {
  const question = elements.question.value.trim();

  if (!currentTranscript) {
    elements.chatStatus.textContent = "请先解析视频。";
    elements.chatStatus.dataset.type = "error";
    return;
  }

  if (!question) {
    elements.chatStatus.textContent = "请输入问题。";
    elements.chatStatus.dataset.type = "error";
    elements.question.focus();
    return;
  }

  const requestId = ++chatRequestId;
  const requestedVideoId = currentVideoId;
  const transcript = currentTranscript;

  chatRequestInProgress = true;
  setButtonLoading(elements.chatButton, true, "发送问题", "回答中...");
  updateQuestionControls();
  elements.chatOutput.hidden = true;
  elements.chatStatus.textContent = "正在分析视频内容并生成回答，请稍候...";
  elements.chatStatus.dataset.type = "info";

  try {
    const apiResponse = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, question })
    });
    const response = await apiResponse.json().catch(() => null);

    if (requestId !== chatRequestId || requestedVideoId !== currentVideoId) {
      return;
    }

    if (!apiResponse.ok || !response?.ok) {
      throw new Error(
        response?.error?.message || `后端请求失败（HTTP ${apiResponse.status}）。`
      );
    }

    showAnswer(response);
  } catch (error) {
    if (requestId !== chatRequestId || requestedVideoId !== currentVideoId) {
      return;
    }

    elements.chatStatus.textContent =
      error instanceof TypeError
        ? "无法连接后端，请确认 PowerShell 中的服务正在运行。"
        : error.message;
    elements.chatStatus.dataset.type = "error";
  } finally {
    if (requestId === chatRequestId) {
      chatRequestInProgress = false;
      setButtonLoading(elements.chatButton, false, "发送问题", "回答中...");
      updateQuestionControls();
    }
  }
}

async function generateSummary() {
  if (!currentTranscript) {
    elements.summaryStatus.textContent = "请先解析视频。";
    elements.summaryStatus.dataset.type = "error";
    return;
  }

  const requestId = ++summaryRequestId;
  const requestedVideoId = currentVideoId;
  const transcript = currentTranscript;

  elements.summaryButton.disabled = true;
  setButtonLoading(elements.summaryButton, true, "生成总结", "生成中...");
  elements.summaryOutput.hidden = true;
  elements.summaryStatus.textContent = "正在生成总结，请稍候...";
  elements.summaryStatus.dataset.type = "info";

  try {
    const apiResponse = await fetch(`${BACKEND_URL}/api/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript })
    });
    const response = await apiResponse.json().catch(() => null);

    if (requestId !== summaryRequestId || requestedVideoId !== currentVideoId) {
      return;
    }

    if (!apiResponse.ok || !response?.ok) {
      throw new Error(
        response?.error?.message || `后端请求失败（HTTP ${apiResponse.status}）。`
      );
    }

    showSummary(response);
  } catch (error) {
    if (requestId !== summaryRequestId || requestedVideoId !== currentVideoId) {
      return;
    }

    elements.summaryStatus.textContent =
      error instanceof TypeError
        ? "无法连接后端，请确认 PowerShell 中的服务正在运行。"
        : error.message;
    elements.summaryStatus.dataset.type = "error";
  } finally {
    if (requestId === summaryRequestId) {
      setButtonLoading(elements.summaryButton, false, "生成总结", "生成中...");
      elements.summaryButton.disabled = !currentTranscript;
    }
  }
}

function showTranscriptDiagnostics(debug) {
  if (!debug) {
    elements.transcriptDebug.hidden = true;
    return;
  }

  elements.transcriptDebugText.textContent = JSON.stringify(debug, null, 2);
  elements.transcriptDebug.hidden = false;
}

function hasNoCaptionTracks(response) {
  return Boolean(
    response?.debug?.steps?.some(
      (step) =>
        step.stage === "track-selection" &&
        step.availableTrackCount === 0 &&
        step.selected === false
    )
  );
}

function applyAudioJob(job) {
  if (!job || job.videoId !== currentVideoId) {
    return;
  }

  if (job.status === "idle") {
    return;
  }

  if (job.status === "preparing") {
    audioJobInProgress = true;
    elements.audioFallback.hidden = false;
    elements.audioFallbackText.textContent = "正在准备当前标签页音频...";
    elements.audioButton.disabled = true;
    setButtonLoading(elements.audioButton, true, "使用音频识别", "准备中...");
    return;
  }

  if (job.status === "capturing") {
    audioJobInProgress = true;
    elements.audioFallback.hidden = false;
    elements.audioFallbackText.textContent = `正在采集第 ${job.currentSegment || 1} / ${
      job.segmentCount || 3
    } 段音频，已完成 ${Math.min(
      job.elapsedSeconds || 0,
      job.durationSeconds || 0
    )} / ${job.durationSeconds || 9} 秒。请保持视频标签页打开。`;
    elements.audioButton.disabled = false;
    setButtonLoading(elements.audioButton, false, "取消音频识别", "准备中...");
    elements.transcriptStatus.textContent = "正在使用音频理解视频内容...";
    elements.transcriptStatus.dataset.type = "info";
    return;
  }

  if (job.status === "uploading") {
    audioJobInProgress = true;
    elements.audioFallback.hidden = false;
    elements.audioFallbackText.textContent = "音频捕获完成，正在进行 AI 语音转写...";
    elements.audioButton.disabled = true;
    setButtonLoading(elements.audioButton, true, "取消音频识别", "转写中...");
    return;
  }

  audioJobInProgress = false;
  elements.audioButton.disabled = false;
  setButtonLoading(elements.audioButton, false, "使用音频识别", "准备中...");

  if (job.status === "complete" && job.transcript) {
    showTranscript({
      transcript: job.transcript,
      segmentCount: 1,
      sourceType: "audio-transcription"
    });
    return;
  }

  elements.audioFallback.hidden = false;
  elements.audioFallbackText.textContent =
    job.status === "cancelled"
      ? "音频识别已取消，可以重新开始。"
      : job.error || "音频识别失败，请稍后重试。";
  elements.transcriptStatus.textContent =
    job.status === "cancelled" ? "音频识别已取消。" : "视频音频识别失败。";
  elements.transcriptStatus.dataset.type = job.status === "cancelled" ? "info" : "error";
}

async function syncAudioJobStatus() {
  if (!currentVideoId) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      target: "background",
      type: "GET_AUDIO_TRANSCRIPTION_STATUS",
      videoId: currentVideoId
    });
    applyAudioJob(response?.job);
  } catch {
    // The background worker may still be starting; regular progress events will retry the UI.
  }
}

async function startAudioTranscription() {
  if (!activeTabId || !currentVideoId) {
    return;
  }

  if (audioJobInProgress) {
    await chrome.runtime.sendMessage({
      target: "background",
      type: "CANCEL_AUDIO_TRANSCRIPTION",
      videoId: currentVideoId
    });
    return;
  }

  elements.audioButton.disabled = true;
  setButtonLoading(elements.audioButton, true, "使用音频识别", "准备中...");
  elements.audioFallbackText.textContent = "正在定位视频的开头、中间和结尾...";

  try {
    const preparation = await chrome.tabs.sendMessage(activeTabId, {
      type: "PREPARE_AUDIO_CAPTURE",
      videoId: currentVideoId
    });

    if (!preparation?.ok) {
      throw new Error(preparation?.error || "无法准备视频音频。");
    }

    const response = await chrome.runtime.sendMessage({
      target: "background",
      type: "START_AUDIO_TRANSCRIPTION",
      tabId: activeTabId,
      videoId: currentVideoId,
      sourceDurationSeconds: preparation.sourceDurationSeconds,
      sampleDurationSeconds: preparation.sampleDurationSeconds,
      segments: preparation.segments
    });

    if (!response?.ok) {
      throw new Error(response?.error || response?.job?.error || "无法启动音频识别。");
    }

    applyAudioJob(response.job);
  } catch (error) {
    audioJobInProgress = false;
    elements.audioButton.disabled = false;
    setButtonLoading(elements.audioButton, false, "使用音频识别", "准备中...");
    elements.audioFallbackText.textContent = error?.message || "无法启动音频识别。";
    elements.transcriptStatus.textContent = "视频音频识别未启动。";
    elements.transcriptStatus.dataset.type = "error";
  }
}

function loadTranscript() {
  if (!activeTabId || !currentVideoId) {
    elements.transcriptStatus.textContent = "请先打开有效的 YouTube 视频。";
    elements.transcriptStatus.dataset.type = "error";
    return;
  }

  const requestedVideoId = currentVideoId;
  currentTranscript = "";
  resetSummary(false);
  resetChat(false);
  elements.transcriptButton.disabled = true;
  setButtonLoading(elements.transcriptButton, true, "解析视频", "解析中...");
  elements.transcriptStatus.textContent = "正在解析视频内容...";
  elements.transcriptStatus.dataset.type = "info";

  chrome.tabs.sendMessage(
    activeTabId,
    { type: "GET_TRANSCRIPT", videoId: requestedVideoId },
    (response) => {
      setButtonLoading(elements.transcriptButton, false, "解析视频", "解析中...");
      elements.transcriptButton.disabled = false;

      if (chrome.runtime.lastError) {
        elements.transcriptStatus.textContent = "无法连接页面，请刷新视频页后重试。";
        elements.transcriptStatus.dataset.type = "error";
        showTranscriptDiagnostics({
          stage: "extension-message",
          error: chrome.runtime.lastError.message
        });
        return;
      }

      if (requestedVideoId !== currentVideoId) {
        return;
      }

      if (!response?.ok) {
        const noCaptions = hasNoCaptionTracks(response);
        elements.transcriptStatus.textContent = noCaptions
          ? "未找到 YouTube 字幕，可选择音频识别。"
          : response?.error || "视频解析失败。";
        elements.transcriptStatus.dataset.type = noCaptions ? "info" : "error";
        elements.audioFallback.hidden = !noCaptions;
        showTranscriptDiagnostics(response?.debug);
        return;
      }

      showTranscript(response);
    }
  );
}

function refreshCurrentVideo() {
  const requestId = ++refreshRequestId;

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (requestId !== refreshRequestId) {
      return;
    }

    if (!tab?.id) {
      activeTabId = null;
      currentVideoId = "";
      elements.details.hidden = true;
      lastVideoSignature = "";
      resetTranscript(false);
      showStatus("无法获取当前标签页。", "error");
      return;
    }

    const video = getVideoInfoFromTab(tab);

    if (!video) {
      activeTabId = null;
      currentVideoId = "";
      elements.details.hidden = true;
      lastVideoSignature = "";
      resetTranscript(false);
      showStatus("当前页面不是有效的 YouTube 视频页。", "error");
      return;
    }

    activeTabId = tab.id;
    const videoChanged = showVideoInfo(video);
    if (videoChanged) {
      syncAudioJobStatus();
    }
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "VIDEO_INFO_UPDATED") {
    refreshCurrentVideo();
  }

  if (message?.target === "popup" && message.type === "AUDIO_TRANSCRIPTION_UPDATE") {
    applyAudioJob(message.job);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  elements.transcriptButton.addEventListener("click", loadTranscript);
  elements.audioButton.addEventListener("click", startAudioTranscription);
  elements.summaryButton.addEventListener("click", generateSummary);
  elements.chatButton.addEventListener("click", sendQuestion);
  elements.question.addEventListener("input", updateQuestionControls);
  elements.question.addEventListener("keydown", (event) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key === "Enter" &&
      !elements.chatButton.disabled
    ) {
      event.preventDefault();
      sendQuestion();
    }
  });
  refreshCurrentVideo();
  window.setInterval(refreshCurrentVideo, 750);
});
