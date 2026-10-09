# 🎬 Caption Studio

Generate **trending captions** and an **SRT subtitle file** from any video or audio — accurate for **Hindi, English and Hinglish**, with output always in **English letters**.

100% free. No sign-up, no API keys, no server. The speech model runs **inside your browser** (WebAssembly / WebGPU), so your files never leave your device.

## ✨ Features

- **Audio & video input** — MP3, WAV, M4A/AAC, OGG, FLAC, MP4, MOV, WEBM, MKV and more.
- **Hindi / English / Hinglish** — powered by OpenAI Whisper running locally via [Transformers.js](https://github.com/huggingface/transformers.js).
- **English letters only** — a built-in Devanagari → Latin transliterator converts Hindi words to readable Hinglish (e.g. `नमस्ते` → `namaste`).
- **Accurate subtitles** — word-timed segments are cleaned, merged and split into readable lines.
- **Export .srt, .vtt, .txt** — drop the `.srt` straight into Premiere, CapCut, DaVinci Resolve, YouTube, etc.
- **Trending caption generator** — a social caption + hashtags + multiple hook variants, built from the transcript keywords.
- **Editable transcript** and click-to-preview subtitles over the video.

## 🚀 Run locally

It's a static site — no build step. Because it uses ES modules and Web Workers, serve it over HTTP (not `file://`):

```bash
cd caption-studio
python3 -m http.server 8080
# open http://localhost:8080
```

## 🌐 Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The included workflow (`.github/workflows/pages.yml`) publishes the site on every push to `main`.

Your site will be live at `https://<username>.github.io/<repo>/`.

> First run downloads the Whisper model (41–249 MB depending on the model size you pick). It is cached by the browser, so later runs start instantly.

## 🧠 How it works

1. **Decode** — the audio track is extracted with the Web Audio API and resampled to 16 kHz mono.
2. **Transcribe** — Whisper (via Transformers.js) runs in a Web Worker and returns timestamped segments.
3. **Romanize** — every Devanagari word is transliterated to English letters, so Hindi + English code-switching becomes clean Hinglish.
4. **Refine** — segments are merged/split into subtitle-length lines.
5. **Generate** — the SRT file and a trending social caption (with hashtags) are produced.

## 🎚️ Choosing a model

| Model | Size | Speed | Accuracy |
| ----- | ---- | ----- | -------- |
| Tiny  | 41 MB  | Fastest | Basic — good for clear English |
| Base  | 77 MB  | Balanced | Decent — okay for Hinglish |
| Small | 249 MB | Slower | Best — recommended for Hindi/Hinglish (**default**) |

## ⚠️ Notes

- Audio decoding uses your browser's built-in codecs. For weird containers (some MKV/AVI), convert to MP4 (AAC) or MP3 first.
- Accuracy depends on audio quality and how clearly people speak. Hinglish is inherently hard — the **Small** model gives the best results.
- Free and open source. No data is uploaded anywhere.

## 📄 License

[MIT](LICENSE)
