const assert = require("node:assert/strict");
const test = require("node:test");
const { ApiError, createApp } = require("../server");

async function withServer(app, callback) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("健康接口报告 Phase 8.1", async () => {
  await withServer(createApp(), async (baseURL) => {
    const response = await fetch(`${baseURL}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, "mochilens-backend");
    assert.equal(body.phase, "8.1");
    assert.equal(typeof body.openaiConfigured, "boolean");
    assert.equal(body.aiProvider, "api.openai.com");
    assert.equal(typeof body.model, "string");
    assert.equal(typeof body.reasoningEffort, "string");
    assert.equal(typeof body.transcriptionModel, "string");
    assert.equal(typeof body.proxyConfigured, "boolean");
  });
});

test("AI 健康接口验证模型连接", async () => {
  const app = createApp({
    aiHealthService: async () => ({
      model: "mock-model",
      provider: "api.openai.com",
      reachable: true
    })
  });

  await withServer(app, async (baseURL) => {
    const response = await fetch(`${baseURL}/api/ai-health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      ok: true,
      model: "mock-model",
      provider: "api.openai.com",
      reachable: true
    });
  });
});

test("音频转写接口接收标签页录音并返回文字", async () => {
  const audio = Buffer.from("mock-webm-audio");
  const app = createApp({
    transcriptionService: async (receivedAudio, metadata) => {
      assert.deepEqual(receivedAudio, audio);
      assert.equal(metadata.mimeType, "audio/webm");
      assert.equal(metadata.videoId, "test-video");
      assert.equal(metadata.durationSeconds, 12);
      return {
        transcript: "识别出的语音内容",
        model: "mock-transcribe-model"
      };
    }
  });

  await withServer(app, async (baseURL) => {
    const response = await fetch(`${baseURL}/api/transcribe`, {
      method: "POST",
      headers: {
        "Content-Type": "audio/webm",
        "X-MochiLens-Video-Id": "test-video",
        "X-MochiLens-Audio-Duration": "12"
      },
      body: audio
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      ok: true,
      transcript: "识别出的语音内容",
      model: "mock-transcribe-model"
    });
  });
});

test("总结接口整理输入并返回总结", async () => {
  const app = createApp({
    summaryService: async (transcript) => {
      assert.equal(transcript, "测试字幕");
      return {
        summary: "测试总结",
        keyPoints: ["知识点一", "知识点二"],
        model: "mock-model"
      };
    }
  });

  await withServer(app, async (baseURL) => {
    const response = await fetch(`${baseURL}/api/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: "  测试字幕  " })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.summary, "测试总结");
    assert.deepEqual(body.keyPoints, ["知识点一", "知识点二"]);
  });
});

test("问答接口整理输入并返回回答", async () => {
  const app = createApp({
    chatService: async (transcript, question) => {
      assert.equal(transcript, "video transcript");
      assert.equal(question, "What happened?");
      return { answer: "A direct answer.", model: "mock-model" };
    }
  });

  await withServer(app, async (baseURL) => {
    const response = await fetch(`${baseURL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: "  video transcript  ",
        question: "  What happened?  "
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      ok: true,
      answer: "A direct answer.",
      model: "mock-model"
    });
  });
});

test("接口拒绝空字段和无效 JSON", async () => {
  await withServer(createApp(), async (baseURL) => {
    const emptyFieldResponse = await fetch(`${baseURL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: "字幕", question: "  " })
    });
    const emptyFieldBody = await emptyFieldResponse.json();

    assert.equal(emptyFieldResponse.status, 400);
    assert.equal(emptyFieldBody.error.code, "INVALID_REQUEST");

    const invalidJSONResponse = await fetch(`${baseURL}/api/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{"
    });
    const invalidJSONBody = await invalidJSONResponse.json();

    assert.equal(invalidJSONResponse.status, 400);
    assert.equal(invalidJSONBody.error.code, "INVALID_JSON");
  });
});

test("接口返回可识别的服务错误和 404", async () => {
  const app = createApp({
    chatService: async () => {
      throw new ApiError(502, "TEST_PROVIDER_ERROR", "测试服务异常。");
    }
  });

  await withServer(app, async (baseURL) => {
    const chatResponse = await fetch(`${baseURL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: "字幕", question: "问题" })
    });
    const chatBody = await chatResponse.json();

    assert.equal(chatResponse.status, 502);
    assert.equal(chatBody.error.code, "TEST_PROVIDER_ERROR");

    const missingResponse = await fetch(`${baseURL}/api/missing`);
    const missingBody = await missingResponse.json();

    assert.equal(missingResponse.status, 404);
    assert.equal(missingBody.error.code, "NOT_FOUND");
  });
});
