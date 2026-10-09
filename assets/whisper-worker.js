import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1";

env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
}

let transcriber = null;
let loadedKey = "";
let loadingPromise = null;

async function loadModel({ model, device, dtype }) {
  const key = `${model}|${device}|${dtype}`;
  if (transcriber && loadedKey === key) {
    self.postMessage({ type: "ready", device });
    return;
  }
  if (loadingPromise && loadedKey === key) {
    await loadingPromise;
    self.postMessage({ type: "ready", device });
    return;
  }

  const report = (p) => self.postMessage({ type: "progress", data: p });
  const options = { dtype, progress_callback: report };

  loadingPromise = (async () => {
    if (device === "webgpu") {
      try {
        options.device = "webgpu";
        transcriber = await pipeline("automatic-speech-recognition", model, options);
        self.postMessage({ type: "notice", message: "Running on WebGPU" });
        return;
      } catch (gpuError) {
        report({ status: "webgpu-fallback", message: String(gpuError && gpuError.message) });
        options.device = "wasm";
        options.dtype = "q8";
        transcriber = await pipeline("automatic-speech-recognition", model, options);
        self.postMessage({ type: "notice", message: "WebGPU unavailable — using CPU (WASM)" });
        return;
      }
    }
    options.device = "wasm";
    transcriber = await pipeline("automatic-speech-recognition", model, options);
  })();

  try {
    await loadingPromise;
    loadedKey = key;
    self.postMessage({ type: "ready", device });
  } finally {
    loadingPromise = null;
  }
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  try {
    if (msg.type === "load") {
      await loadModel(msg);
    } else if (msg.type === "transcribe") {
      if (!transcriber) throw new Error("Model is not loaded yet.");
      const options = {
        task: "transcribe",
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
        force_full_sequences: false,
      };
      if (msg.language) options.language = msg.language;
      const output = await transcriber(msg.audio, options);
      self.postMessage({
        type: "result",
        text: output.text || "",
        chunks: output.chunks || null,
        duration: msg.duration || 0,
      });
    }
  } catch (error) {
    self.postMessage({ type: "error", error: String((error && error.message) || error) });
  }
};
