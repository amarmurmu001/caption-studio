import { romanizeSegments } from "./transliterate.js";
import { refineSegments, toSRT, toVTT, toTXT, toTimestampedTXT, formatTime } from "./srt.js";
import { generateCaptions } from "./captions.js";

const MODELS = {
  tiny: "Xenova/whisper-tiny",
  base: "Xenova/whisper-base",
  small: "Xenova/whisper-small",
};

const LANGUAGE_MAP = {
  hinglish: { language: "hi", romanize: true },
  hindi: { language: "hi", romanize: true },
  english: { language: "en", romanize: true },
  auto: { language: null, romanize: true },
};

const state = {
  file: null,
  mediaURL: null,
  segments: [],
  rawSegments: [],
  captions: null,
  worker: null,
  pending: { load: null, transcribe: null },
  running: false,
};

const $ = (id) => document.getElementById(id);

const els = {
  dropZone: $("drop-zone"),
  fileInput: $("file-input"),
  fileCard: $("file-card"),
  fileName: $("file-name"),
  fileSize: $("file-size"),
  fileClear: $("file-clear"),
  lang: $("lang"),
  model: $("model"),
  device: $("device"),
  romanize: $("romanize"),
  emojis: $("emojis"),
  generateBtn: $("generate-btn"),
  progress: $("progress"),
  progressBar: $("progress-bar"),
  progressText: $("progress-text"),
  progressLog: $("progress-log"),
  results: $("results"),
  mediaWrap: $("media-wrap"),
  playerAudio: $("player-audio"),
  playerVideo: $("player-video"),
  subtitleOverlay: $("subtitle-overlay"),
  transcriptText: $("transcript-text"),
  transcriptStats: $("transcript-stats"),
  captionsList: $("captions-list"),
  socialTitle: $("social-title"),
  socialCaption: $("social-caption"),
  socialHashtags: $("social-hashtags"),
  variants: $("variants"),
  srtPreview: $("srt-preview"),
  toast: $("toast"),
};

function isMediaFile(file) {
  if (!file) return false;
  if (file.type && (file.type.startsWith("audio/") || file.type.startsWith("video/"))) return true;
  return /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|webm|mp4|mov|mkv|3gp|m4v|avi)$/i.test(file.name);
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function log(message, isError = false) {
  const line = document.createElement("div");
  line.className = "log-line" + (isError ? " log-error" : "");
  line.textContent = message;
  els.progressLog.appendChild(line);
  els.progressLog.scrollTop = els.progressLog.scrollHeight;
}

async function copy(text, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    toast("Copy failed — select and copy manually");
  }
}

function download(filename, content, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function baseName() {
  if (!state.file) return "captions";
  return state.file.name.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_") || "captions";
}

function selectFile(file) {
  if (!isMediaFile(file)) {
    toast("Please choose an audio or video file");
    return;
  }
  state.file = file;
  if (state.mediaURL) URL.revokeObjectURL(state.mediaURL);
  state.mediaURL = URL.createObjectURL(file);

  els.fileName.textContent = file.name;
  els.fileSize.textContent = `${formatBytes(file.size)} · ${file.type || "unknown type"}`;
  els.fileCard.hidden = false;
  els.dropZone.classList.add("has-file");
  els.generateBtn.disabled = false;
  resetResults();
  setupPreview();
}

function clearFile() {
  state.file = null;
  if (state.mediaURL) {
    URL.revokeObjectURL(state.mediaURL);
    state.mediaURL = null;
  }
  els.fileInput.value = "";
  els.fileCard.hidden = true;
  els.dropZone.classList.remove("has-file");
  els.generateBtn.disabled = true;
  els.playerAudio.removeAttribute("src");
  els.playerVideo.removeAttribute("src");
  els.playerAudio.load();
  els.playerVideo.load();
  resetResults();
}

function setupPreview() {
  const isVideo = state.file.type.startsWith("video/") || /\.(mp4|mov|mkv|webm|m4v|avi|3gp)$/i.test(state.file.name);
  els.playerAudio.hidden = isVideo;
  els.playerVideo.hidden = !isVideo;
  const player = isVideo ? els.playerVideo : els.playerAudio;
  player.src = state.mediaURL;
  player.load();
}

function resetResults() {
  state.segments = [];
  state.rawSegments = [];
  state.captions = null;
  els.results.hidden = true;
  els.progress.hidden = true;
  els.progressLog.textContent = "";
  els.progressBar.style.width = "0%";
  els.progressBar.classList.remove("indeterminate");
  els.subtitleOverlay.textContent = "";
}

async function extractAudio(file, onStage) {
  onStage("Reading file…");
  const arrayBuffer = await file.arrayBuffer();
  onStage("Decoding audio track…");
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer);
  } catch {
    await ctx.close();
    throw new Error(
      "Could not decode the audio in this file. Your browser may not support its codec (common with iPhone/HEVC or .mkv videos). Convert it to MP4 (H.264 + AAC) or MP3, then try again."
    );
  }
  const duration = decoded.duration;
  onStage("Resampling to 16 kHz mono…");
  const targetRate = 16000;
  const frames = Math.max(1, Math.ceil(duration * targetRate));
  const offline = new OfflineAudioContext(1, frames, targetRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  await ctx.close();
  const audio = new Float32Array(rendered.getChannelData(0));
  return { audio, duration };
}

function ensureWorker() {
  if (state.worker) return state.worker;
  const worker = new Worker(new URL("./whisper-worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (event) => handleWorkerMessage(event.data);
  worker.onerror = (event) => {
    log(`Worker error: ${event.message || "unknown"}`, true);
    const err = new Error(event.message || "Worker error");
    state.pending.load?.reject(err);
    state.pending.transcribe?.reject(err);
    state.pending.load = null;
    state.pending.transcribe = null;
  };
  state.worker = worker;
  return worker;
}

const downloadState = { files: new Map() };

function handleWorkerMessage(msg) {
  if (msg.type === "progress") {
    updateProgress(msg.data);
  } else if (msg.type === "notice") {
    log(msg.message);
  } else if (msg.type === "ready") {
    log("Model ready.");
    state.pending.load?.resolve();
    state.pending.load = null;
  } else if (msg.type === "result") {
    state.pending.transcribe?.resolve(msg);
    state.pending.transcribe = null;
  } else if (msg.type === "error") {
    log(`Error: ${msg.error}`, true);
    if (state.pending.transcribe) {
      state.pending.transcribe.reject(new Error(msg.error));
      state.pending.transcribe = null;
    } else if (state.pending.load) {
      state.pending.load.reject(new Error(msg.error));
      state.pending.load = null;
    }
  }
}

function updateProgress(data) {
  if (!data) return;
  if (data.status === "progress" && data.total) {
    downloadState.files.set(data.file, { loaded: data.loaded, total: data.total });
    let loaded = 0;
    let total = 0;
    for (const value of downloadState.files.values()) {
      loaded += value.loaded;
      total += value.total;
    }
    const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
    els.progressBar.classList.remove("indeterminate");
    els.progressBar.style.width = `${pct}%`;
    const name = (data.file || "").split("/").pop();
    els.progressText.textContent = `Downloading model… ${pct}% (${name})`;
  } else if (data.status === "initiate" || data.status === "download") {
    els.progressText.textContent = "Connecting to model files…";
  } else if (data.status === "done") {
    log(`Loaded ${(data.file || "").split("/").pop()}`);
  } else if (data.status === "webgpu-fallback") {
    log("WebGPU failed, switching to CPU.", true);
  }
}

function loadModel() {
  const worker = ensureWorker();
  const device = els.device.checked ? "webgpu" : "wasm";
  const dtype = device === "webgpu" ? "fp32" : "q8";
  const model = MODELS[els.model.value] || MODELS.base;
  downloadState.files.clear();
  return new Promise((resolve, reject) => {
    state.pending.load = { resolve, reject };
    worker.postMessage({ type: "load", model, device, dtype });
  });
}

function transcribe(audio, language, duration) {
  const worker = ensureWorker();
  return new Promise((resolve, reject) => {
    state.pending.transcribe = { resolve, reject };
    worker.postMessage({ type: "transcribe", audio, language, duration }, [audio.buffer]);
  });
}

function buildSegments(chunks, fullText, duration) {
  let segments = [];
  if (chunks && chunks.length) {
    for (const chunk of chunks) {
      const [start, end] = chunk.timestamp || [];
      if (start === null || start === undefined) continue;
      const text = (chunk.text || "").trim();
      if (!text) continue;
      segments.push({
        start: Number(start) || 0,
        end: end === null || end === undefined ? duration : Number(end),
        text,
      });
    }
  }
  if (!segments.length && fullText) {
    segments = [{ start: 0, end: duration || 0, text: fullText.trim() }];
  }
  for (let i = 0; i < segments.length; i++) {
    if (!segments[i].end || segments[i].end <= segments[i].start) {
      segments[i].end = i < segments.length - 1 ? segments[i + 1].start : segments[i].start + 2;
    }
  }
  return segments;
}

function dedupeSegments(segments) {
  const key = (text) =>
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\u0900-\u097F ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const out = [];
  for (const seg of segments) {
    const k = key(seg.text);
    const prev = out[out.length - 1];
    if (prev && k && k === prev.k) {
      prev.end = Math.max(prev.end, seg.end);
      continue;
    }
    out.push({ start: seg.start, end: seg.end, text: seg.text, k });
  }
  return out.map(({ start, end, text }) => ({ start, end, text }));
}

async function generate() {
  if (state.running || !state.file) return;
  state.running = true;
  els.generateBtn.disabled = true;
  els.generateBtn.classList.add("loading");
  els.results.hidden = true;
  els.progress.hidden = false;
  els.progressLog.textContent = "";
  els.progressBar.style.width = "0%";
  els.progressBar.classList.remove("indeterminate");

  const config = LANGUAGE_MAP[els.lang.value] || LANGUAGE_MAP.hinglish;

  try {
    els.progressText.textContent = "Extracting audio…";
    const { audio, duration } = await extractAudio(state.file, (stage) => {
      els.progressText.textContent = stage;
    });
    log(`Audio ready · ${formatTime(duration, ".")} @ 16 kHz mono`);

    els.progressText.textContent = "Loading speech model (first run downloads it)…";
    await loadModel();

    els.progressBar.classList.add("indeterminate");
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const secs = Math.round((Date.now() - startedAt) / 1000);
      els.progressText.textContent = `Transcribing… ${secs}s elapsed — keep this tab open.`;
    }, 1000);
    els.progressText.textContent = "Transcribing… starting (keep this tab open)…";
    let result;
    try {
      result = await transcribe(audio, config.language, duration);
    } finally {
      clearInterval(tick);
    }
    els.progressBar.classList.remove("indeterminate");
    els.progressBar.style.width = "100%";

    const useRoman = els.romanize.checked && config.romanize !== false;
    let segments = buildSegments(result.chunks, result.text, duration);
    state.rawSegments = segments.map((s) => ({ ...s }));
    if (useRoman) segments = romanizeSegments(segments);
    segments = refineSegments(segments, { maxChars: 64, maxDuration: 6 });
    segments = dedupeSegments(segments);
    state.segments = segments;
    els.progressText.textContent = "Building captions…";
    state.captions = generateCaptions(segments, { language: els.lang.value, emojis: els.emojis.checked });

    renderResults();
    els.results.hidden = false;
    els.results.scrollIntoView({ behavior: "smooth", block: "start" });
    toast("Captions ready");
  } catch (error) {
    log(String((error && error.message) || error), true);
    els.progressText.textContent = "Something went wrong — see details below.";
  } finally {
    state.running = false;
    els.generateBtn.disabled = false;
    els.generateBtn.classList.remove("loading");
  }
}

function renderResults() {
  const segments = state.segments;
  const captions = state.captions;

  els.transcriptText.value = segments.map((s) => s.text).join("\n");
  const words = (segments.map((s) => s.text).join(" ").match(/[a-z0-9]+/gi) || []).length;
  const duration = segments.length ? segments[segments.length - 1].end : 0;
  els.transcriptStats.textContent = `${segments.length} lines · ${words} words · ${formatTime(duration, ".")}`;

  els.captionsList.textContent = "";
  segments.forEach((seg, index) => {
    const row = document.createElement("div");
    row.className = "caption-row";
    const time = document.createElement("span");
    time.className = "caption-time";
    time.textContent = `${formatTime(seg.start, ".").slice(3)} → ${formatTime(seg.end, ".").slice(3)}`;
    const text = document.createElement("span");
    text.className = "caption-text";
    text.textContent = seg.text;
    row.append(time, text);
    row.addEventListener("click", () => {
      const player = els.playerVideo.hidden ? els.playerAudio : els.playerVideo;
      player.currentTime = seg.start;
      player.play().catch(() => {});
    });
    els.captionsList.appendChild(row);
  });

  els.socialTitle.textContent = captions.title;
  els.socialCaption.value = captions.caption;
  els.socialHashtags.textContent = "";
  captions.hashtags.forEach((tag) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.type = "button";
    chip.textContent = tag;
    chip.addEventListener("click", () => copy(tag, `${tag} copied`));
    els.socialHashtags.appendChild(chip);
  });

  els.variants.textContent = "";
  captions.variants.forEach((variant) => {
    const card = document.createElement("div");
    card.className = "variant";
    const badge = document.createElement("span");
    badge.className = "variant-badge";
    badge.textContent = variant.style;
    const text = document.createElement("p");
    text.textContent = variant.text;
    const useBtn = document.createElement("button");
    useBtn.className = "btn btn-ghost btn-sm";
    useBtn.type = "button";
    useBtn.textContent = "Use this";
    useBtn.addEventListener("click", () => {
      els.socialCaption.value = variant.text;
      toast("Caption applied");
    });
    card.append(badge, text, useBtn);
    els.variants.appendChild(card);
  });

  els.srtPreview.textContent = toSRT(segments).slice(0, 4000);
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      const panel = document.getElementById(`tab-${tab.dataset.tab}`);
      if (panel) panel.classList.add("active");
    });
  });
}

function bindEvents() {
  els.dropZone.addEventListener("click", () => els.fileInput.click());
  els.dropZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      els.fileInput.click();
    }
  });
  els.fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) selectFile(e.target.files[0]);
  });
  els.fileClear.addEventListener("click", (e) => {
    e.stopPropagation();
    clearFile();
  });

  ["dragenter", "dragover"].forEach((evt) =>
    els.dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      els.dropZone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    els.dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      els.dropZone.classList.remove("dragover");
    })
  );
  els.dropZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) selectFile(file);
  });

  els.generateBtn.addEventListener("click", generate);

  $("btn-copy-transcript").addEventListener("click", () =>
    copy(els.transcriptText.value, "Transcript copied")
  );
  $("btn-download-transcript").addEventListener("click", () =>
    download(`${baseName()}.txt`, els.transcriptText.value)
  );
  $("btn-copy-captions").addEventListener("click", () =>
    copy(state.segments.map((s) => s.text).join("\n"), "Caption lines copied")
  );
  $("btn-copy-social").addEventListener("click", () =>
    copy(els.socialCaption.value, "Caption copied")
  );
  $("btn-download-social").addEventListener("click", () =>
    download(`${baseName()}-caption.txt`, els.socialCaption.value)
  );
  $("btn-download-srt").addEventListener("click", () =>
    download(`${baseName()}.srt`, toSRT(state.segments), "application/x-subrip")
  );
  $("btn-download-vtt").addEventListener("click", () =>
    download(`${baseName()}.vtt`, toVTT(state.segments), "text/vtt")
  );
  $("btn-download-txt").addEventListener("click", () =>
    download(`${baseName()}-plain.txt`, toTXT(state.segments))
  );
  $("btn-download-timestamped").addEventListener("click", () =>
    download(`${baseName()}-timestamps.txt`, toTimestampedTXT(state.segments))
  );

  const overlay = () => {
    const player = els.playerVideo.hidden ? els.playerAudio : els.playerVideo;
    const t = player.currentTime;
    const active = state.segments.find((s) => t >= s.start && t < s.end);
    els.subtitleOverlay.textContent = active ? active.text : "";
    els.subtitleOverlay.classList.toggle("visible", Boolean(active));
  };
  els.playerAudio.addEventListener("timeupdate", overlay);
  els.playerVideo.addEventListener("timeupdate", overlay);

  bindTabs();
}

bindEvents();

window.addEventListener("error", (e) => {
  if (e.message) log(`Unexpected error: ${e.message}`, true);
});
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason && (e.reason.message || e.reason);
  if (reason) log(`Unhandled error: ${reason}`, true);
});
