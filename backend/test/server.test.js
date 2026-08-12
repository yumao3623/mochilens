const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ApiError,
  answerQuestion,
  createApp,
  normalizeBailianBaseURL,
  parseVideoSummary,
  summarizeTranscript,
  transcribeAudio
} = require("../server");

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

async function withMockBailian(responseBody, callback) {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = {
    BAILIAN_API_KEY: process.env.BAILIAN_API_KEY,
    BAILIAN_API_HOST: process.env.BAILIAN_API_HOST,
    BAILIAN_TEXT_MODEL: process.env.BAILIAN_TEXT_MODEL,
    BAILIAN_TRANSCRIBE_MODEL: process.env.BAILIAN_TRANSCRIBE_MODEL
  };
  const requests = [];

  process.env.BAILIAN_API_KEY = "test-key-not-secret";
  process.env.BAILIAN_API_HOST =
    "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";
  process.env.BAILIAN_TEXT_MODEL = "qwen3.7-flash";
  process.env.BAILIAN_TRANSCRIBE_MODEL = "qwen3-asr-flash";
  globalThis.fetch = async (url, init) => {
    requests.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body || "{}"))
    });
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    await callback(requests);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
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
    assert.equal(body.contractVersion, "2026-08-12");
    assert.equal(typeof body.revision, "string");
    assert.equal(typeof body.bailianConfigured, "boolean");
    assert.equal(body.aiProvider, "aliyun-bailian");
    assert.equal(typeof body.providerHost, "string");
    assert.equal(typeof body.model, "string");
    assert.equal(typeof body.transcriptionModel, "string");
    assert.equal(typeof body.omniModel, "string");
    assert.equal(typeof body.proxyConfigured, "boolean");
  });
});

test("AI 健康接口验证模型连接", async () => {
  const app = createApp({
    aiHealthService: async () => ({
      model: "mock-model",
      provider: "aliyun-bailian",
      providerHost: "workspace.cn-beijing.maas.aliyuncs.com",
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
      provider: "aliyun-bailian",
      providerHost: "workspace.cn-beijing.maas.aliyuncs.com",
      reachable: true
    });
  });
});

test("百炼 API Host 只接受华北2兼容接口并去除请求路径", () => {
  assert.equal(
    normalizeBailianBaseURL("workspace.cn-beijing.maas.aliyuncs.com"),
    "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
  );

  assert.equal(
    normalizeBailianBaseURL(
      "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions/"
    ),
    "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
  );

  assert.equal(
    normalizeBailianBaseURL("https://dashscope.aliyuncs.com/compatible-mode/v1"),
    "https://dashscope.aliyuncs.com/compatible-mode/v1"
  );

  assert.throws(
    () =>
      normalizeBailianBaseURL(
        "https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"
      ),
    (error) => error instanceof ApiError && error.code === "BAILIAN_CONFIG_INVALID"
  );
});

test("百炼总结 JSON 会被整理成扩展需要的结构", () => {
  assert.deepEqual(
    parseVideoSummary(
      '```json\n{"summary":"测试总结","keyPoints":["一","二","三"]}\n```'
    ),
    {
      summary: "测试总结",
      keyPoints: ["一", "二", "三"]
    }
  );

  assert.deepEqual(
    parseVideoSummary('{"summary":"短视频总结","keyPoints":["有效知识点一","有效知识点二"]}'),
    {
      summary: "短视频总结",
      keyPoints: ["有效知识点一", "有效知识点二"]
    }
  );
});

test("总结通过百炼 Chat Completions 发送结构化请求", async () => {
  await withMockBailian(
    {
      model: "qwen3.7-flash",
      choices: [
        {
          message: {
            content:
              '{"summary":"测试总结","keyPoints":["知识点一","知识点二","知识点三"]}'
          }
        }
      ]
    },
    async (requests) => {
      const result = await summarizeTranscript("测试视频内容");

      assert.equal(result.summary, "测试总结");
      assert.equal(requests.length, 1);
      assert.match(requests[0].url, /\/compatible-mode\/v1\/chat\/completions$/);
      assert.equal(requests[0].body.model, "qwen3.7-flash");
      assert.equal(requests[0].body.enable_thinking, false);
      assert.deepEqual(requests[0].body.response_format, { type: "json_object" });
    }
  );
});

test("问答通过百炼返回自然语言答案", async () => {
  await withMockBailian(
    {
      model: "qwen3.7-flash",
      choices: [{ message: { content: "A direct answer." } }]
    },
    async (requests) => {
      const result = await answerQuestion("video record", "What happened?");

      assert.equal(result.answer, "A direct answer.");
      assert.equal(requests[0].body.model, "qwen3.7-flash");
      assert.equal(requests[0].body.enable_thinking, false);
      assert.match(requests[0].body.messages[1].content, /What happened\?/);
    }
  );
});

test("音频通过百炼 ASR Chat Completions 发送 Base64 数据", async () => {
  await withMockBailian(
    {
      model: "qwen3-asr-flash",
      choices: [{ message: { content: "识别出的语音内容" } }]
    },
    async (requests) => {
      const result = await transcribeAudio(Buffer.from("mock-webm-audio"), {
        mimeType: "audio/webm"
      });

      assert.equal(result.transcript, "识别出的语音内容");
      assert.equal(requests[0].body.model, "qwen3-asr-flash");
      assert.equal(requests[0].body.asr_options.enable_itn, true);
      assert.match(
        requests[0].body.messages[0].content[0].input_audio.data,
        /^data:audio\/webm;base64,/
      );
    }
  );
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
