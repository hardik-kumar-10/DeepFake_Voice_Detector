# VoiceShield — AI Deepfake Voice Detector
### Built as an internship demo for [PaladinAI](https://www.paladintech.ai/)

---

## 🎯 What It Does

VoiceShield is a browser-based deepfake voice detection tool that analyzes audio files to determine if a voice is **authentic (human)** or **synthetic (AI-generated / deepfaked)**.

It mirrors PaladinAI's **Phonetic AI** and **DeepGaze** products — using multi-layer signal analysis to expose voice manipulation.

---

## 🛠 How It Works

### Pipeline

```
Audio File / Live Recording
         ↓
  Feature Extraction (Web Audio API)
  - RMS Energy, Zero Crossing Rate
  - Spectral Centroid & Flatness
  - Silence Ratio, Pitch Variance
  - Dynamic Range, Temporal Coherence
         ↓
  Transcription (OpenAI Whisper)
         ↓
  Multi-Layer AI Analysis (GPT-4o)
  - Spectral Consistency
  - Prosodic Naturalness
  - Phonetic Coherence
  - Breath Pattern Analysis
  - Micro-Variance Detection
  - Temporal Coherence
         ↓
  Verdict: AUTHENTIC / DEEPFAKE / UNCERTAIN
  Confidence Score + Full Forensic Report
```

---

## 🚀 Getting Started

### Requirements
- A modern browser (Chrome, Firefox, Edge, Safari)
- An [OpenAI API key](https://platform.openai.com/api-keys) with access to `gpt-4o` and `whisper-1`

### Run Locally

Since this is a pure HTML/CSS/JS app — no build step needed:

```bash
# Option 1: Open directly
open index.html

# Option 2: Serve locally (recommended to avoid CORS on some browsers)
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

---

## 🧪 Testing It

### Test with a known AI voice:
1. Go to [ElevenLabs.io](https://elevenlabs.io) or [Play.ht](https://play.ht) and generate a short voice clip
2. Download the MP3
3. Upload to VoiceShield → should detect as **DEEPFAKE**

### Test with a real voice:
1. Use the **Record Live Audio** button to record yourself speaking
2. Should detect as **AUTHENTIC**

---

## 🔬 Detection Methodology

| Signal Layer | What We Detect |
|---|---|
| Spectral Consistency | Unnatural frequency smoothing in TTS outputs |
| Prosodic Naturalness | Monotone pitch / unnatural stress patterns |
| Phonetic Coherence | Stitched phonemes vs. natural co-articulation |
| Breath Pattern | Absence of natural breath sounds in AI voices |
| Micro-Variance | AI voices are "too perfect" — lacks human jitter |
| Temporal Coherence | Unnatural pauses, clipped audio artifacts |

---

## 🏗 Architecture

```
voiceshield/
├── index.html      # Single-page app structure
├── style.css       # Dark cybersecurity UI
├── app.js          # Core logic: audio analysis, API calls, UI
└── README.md
```

No frameworks. No dependencies. Pure Web APIs + OpenAI.

---

## 🔐 Privacy

- **Your API key is never stored** — it lives only in the browser session
- **Audio is never stored** — processed in-memory and sent directly to OpenAI
- All analysis happens client-side except the OpenAI API calls

---

## 💡 Potential Extensions

- **Batch analysis** — process multiple files at once
- **Real-time streaming** — analyze voice as it's spoken
- **Visual spectrogram** — show frequency heatmap
- **Report export** — PDF forensic report generation
- **Model fine-tuning** — train on known deepfake datasets (FakeAVCeleb, ASVspoof)
- **REST API wrapper** — expose as enterprise endpoint

---

## 👨‍💻 About

Built by Hardik Kumar as a demo project for the **PaladinAI internship application**.

PaladinAI builds AI-powered cybersecurity tools for enterprises and governments, including deepfake detection, big data analytics, and AI case management.

---

*VoiceShield · Powered by OpenAI Whisper + GPT-4o · Built for PaladinAI*
