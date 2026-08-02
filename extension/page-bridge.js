(() => {
  if (window.__mochiLensPageBridgeLoaded) {
    return;
  }

  window.__mochiLensPageBridgeLoaded = true;

  const BRIDGE_REQUEST_SOURCE = "MOCHILENS_CONTENT";
  const BRIDGE_RESPONSE_SOURCE = "MOCHILENS_PAGE";

  function parsePlayerResponse(value) {
    if (!value) {
      return null;
    }

    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }

    return value;
  }

  function readPlayerResponse(player) {
    const directResponse = (() => {
      try {
        return parsePlayerResponse(player.getPlayerResponse?.());
      } catch {
        return null;
      }
    })();

    if (directResponse) {
      return directResponse;
    }

    try {
      const config = player.getPlayerConfig?.();
      return (
        parsePlayerResponse(config?.args?.raw_player_response) ||
        parsePlayerResponse(config?.args?.player_response) ||
        parsePlayerResponse(config?.raw_player_response) ||
        parsePlayerResponse(config?.player_response)
      );
    } catch {
      return null;
    }
  }

  function getPlayerCandidates() {
    const activeShortPlayer = document.querySelector(
      "ytd-reel-video-renderer[is-active] #movie_player"
    );
    const playingVideo = Array.from(document.querySelectorAll("video")).find(
      (video) => !video.paused && !video.ended
    );
    const playingVideoPlayer = playingVideo?.closest("#movie_player");
    return Array.from(
      new Set(
        [activeShortPlayer, playingVideoPlayer, ...document.querySelectorAll("#movie_player")].filter(
          Boolean
        )
      )
    );
  }

  function getPlayerResponse(expectedVideoId) {
    const players = getPlayerCandidates();
    const responses = players
      .map((player) => {
        let videoData;

        try {
          videoData = player.getVideoData?.();
        } catch {
          videoData = null;
        }

        return {
          playerVideoId: videoData?.video_id || videoData?.videoId || null,
          response: readPlayerResponse(player)
        };
      })
      .filter((entry) => entry.response);

    const matchingEntry = responses.find(
      (entry) =>
        entry.response.videoDetails?.videoId === expectedVideoId ||
        (!entry.response.videoDetails?.videoId && entry.playerVideoId === expectedVideoId)
    );

    if (matchingEntry) {
      return matchingEntry.response;
    }

    if (window.ytInitialPlayerResponse?.videoDetails?.videoId === expectedVideoId) {
      return window.ytInitialPlayerResponse;
    }

    return null;
  }

  function getRuntimeCaptionUrls(expectedVideoId) {
    return performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((entryUrl) => {
        try {
          const url = new URL(entryUrl);
          return url.pathname === "/api/timedtext" && url.searchParams.get("v") === expectedVideoId;
        } catch {
          return false;
        }
      })
      .filter((entryUrl, index, entries) => entries.indexOf(entryUrl) === index);
  }

  async function activateCaptions(expectedVideoId) {
    const player = getPlayerCandidates().find((candidate) => {
      try {
        const videoData = candidate.getVideoData?.();
        const response = readPlayerResponse(candidate);
        return (
          videoData?.video_id === expectedVideoId ||
          videoData?.videoId === expectedVideoId ||
          response?.videoDetails?.videoId === expectedVideoId
        );
      } catch {
        return false;
      }
    });

    const captionsButton = player?.querySelector?.(".ytp-subtitles-button");

    if (captionsButton) {
      if (captionsButton.getAttribute("aria-pressed") === "true") {
        captionsButton.click();
        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }

      captionsButton.click();
      return true;
    }

    try {
      player?.unloadModule?.("captions");
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      player?.loadModule?.("captions");
      const tracklist = player?.getOption?.("captions", "tracklist") || [];

      if (tracklist[0]) {
        player.setOption?.("captions", "track", tracklist[0]);
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  async function waitForRuntimeCaptionUrls(expectedVideoId) {
    let urls = getRuntimeCaptionUrls(expectedVideoId);

    if (urls.length) {
      return { urls, captionsActivated: false, triggerAttempts: 0 };
    }

    let triggerAttempts = 0;

    for (let cycle = 0; cycle < 2 && !urls.length; cycle += 1) {
      if (await activateCaptions(expectedVideoId)) {
        triggerAttempts += 1;
      }

      for (let attempt = 0; attempt < 20 && !urls.length; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 200));
        urls = getRuntimeCaptionUrls(expectedVideoId);
      }
    }

    return {
      urls,
      captionsActivated: triggerAttempts > 0,
      triggerAttempts
    };
  }

  function getTrackName(name) {
    if (name?.simpleText) {
      return name.simpleText;
    }

    return (name?.runs || []).map((run) => run.text || "").join("").trim();
  }

  window.addEventListener("message", async (event) => {
    const data = event.data;

    if (
      event.source !== window ||
      event.origin !== window.location.origin ||
      data?.source !== BRIDGE_REQUEST_SOURCE ||
      data?.type !== "GET_PLAYER_DATA"
    ) {
      return;
    }

    const playerResponse = getPlayerResponse(data.videoId);
    const runtimeCaptions = await waitForRuntimeCaptionUrls(data.videoId);

    if (!playerResponse) {
      if (runtimeCaptions.urls.length) {
        window.postMessage(
          {
            source: BRIDGE_RESPONSE_SOURCE,
            type: "PLAYER_DATA",
            requestId: data.requestId,
            videoId: data.videoId,
            captionTracks: [],
            runtimeCaptionUrls: runtimeCaptions.urls,
            captionsActivated: runtimeCaptions.captionsActivated,
            captionTriggerAttempts: runtimeCaptions.triggerAttempts
          },
          window.location.origin
        );
        return;
      }

      window.postMessage(
        {
          source: BRIDGE_RESPONSE_SOURCE,
          type: "PLAYER_DATA",
          requestId: data.requestId,
          error: "未找到当前视频的播放器数据。"
        },
        window.location.origin
      );
      return;
    }

    const captionTracks =
      playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

    window.postMessage(
      {
        source: BRIDGE_RESPONSE_SOURCE,
        type: "PLAYER_DATA",
        requestId: data.requestId,
        videoId: playerResponse.videoDetails?.videoId || data.videoId,
        runtimeCaptionUrls: runtimeCaptions.urls,
        captionsActivated: runtimeCaptions.captionsActivated,
        captionTriggerAttempts: runtimeCaptions.triggerAttempts,
        captionTracks: captionTracks.map((track) => ({
          baseUrl: track.baseUrl,
          languageCode: track.languageCode || "",
          languageName: getTrackName(track.name) || track.languageCode || "未知语言",
          isAutoGenerated: track.kind === "asr"
        }))
      },
      window.location.origin
    );
  });
})();
