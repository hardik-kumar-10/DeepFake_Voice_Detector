// ===== STATE =====
let audioFile = null;
let audioBuffer = null;
let audioContext = null;
let audioSource = null;
let isPlaying = false;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let animationId = null;
let reportText = '';

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initHistory();
  setupDropZone();
  setupFileInput();
  setupApiKeyListener();
  setupAudioPlayer();
  setupScrollBehaviors();
});

// ===== DROP ZONE =====
function setupDropZone() {
  const dropZone = document.getElementById('dropZone');
  const uploadCard = document.getElementById('uploadCard');

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadCard.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    uploadCard.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadCard.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) {
      handleAudioFile(file);
    } else {
      showToast('Please drop a valid audio file.', 'error');
    }
  });
}

function setupFileInput() {
  document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleAudioFile(file);
  });
}

function setupApiKeyListener() {
  const input = document.getElementById('apiKey');
  const apiDocKey = document.getElementById('api-doc-key');

  input.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    checkReadyState();

    // Update API Docs real-time
    if (val) {
      const masked = val.length > 8 ? val.substring(0, 8) + '...' : val;
      apiDocKey.textContent = masked;
    } else {
      apiDocKey.textContent = 'sk-...';
    }
  });
}

function handleAudioFile(file) {
  audioFile = file;
  document.getElementById('uploadCard').classList.add('has-file');
  document.getElementById('api-doc-file').textContent = file.name;

  // Update upload label
  const label = document.querySelector('.upload-label');
  label.textContent = `✓ ${file.name}`;
  label.style.color = 'var(--accent)';

  const sub = document.querySelector('.upload-sub');
  sub.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB · ${file.type}`;

  // Draw waveform
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioBuffer = await audioContext.decodeAudioData(e.target.result);
      drawWaveform(audioBuffer);

      // Set audio player
      const url = URL.createObjectURL(file);
      document.getElementById('audioPlayer').src = url;
      document.getElementById('fileInfo').textContent = `${formatTime(audioBuffer.duration)} · ${audioBuffer.sampleRate}Hz`;

      document.getElementById('waveformSection').style.display = 'block';
      document.getElementById('waveformSection').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      showToast('Could not decode audio file.', 'error');
    }
  };
  reader.readAsArrayBuffer(file);

  checkReadyState();
}

// ===== WAVEFORM =====
function drawWaveform(buffer) {
  const canvas = document.getElementById('waveformCanvas');
  const ctx = canvas.getContext('2d');
  const width = canvas.offsetWidth;
  const height = canvas.height;
  canvas.width = width;

  const data = buffer.getChannelData(0);
  const step = Math.ceil(data.length / width);
  const amp = height / 2;

  ctx.clearRect(0, 0, width, height);

  // Gradient
  const styles = getComputedStyle(document.body);
  const accent1 = styles.getPropertyValue('--accent2').trim() || 'rgba(0,102,255,0.7)';
  const accent2 = styles.getPropertyValue('--accent').trim() || 'rgba(0,245,196,0.9)';

  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, accent1);
  grad.addColorStop(0.5, accent2);
  grad.addColorStop(1, accent1);

  ctx.beginPath();
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.5;

  for (let i = 0; i < width; i++) {
    let min = 1, max = -1;
    for (let j = 0; j < step; j++) {
      const datum = data[i * step + j] || 0;
      if (datum < min) min = datum;
      if (datum > max) max = datum;
    }
    const yLow = (1 + min) * amp;
    const yHigh = (1 + max) * amp;
    ctx.moveTo(i, yLow);
    ctx.lineTo(i, yHigh);
  }
  ctx.stroke();
}

// ===== PLAYBACK =====
function setupAudioPlayer() {
  const player = document.getElementById('audioPlayer');
  player.addEventListener('timeupdate', () => {
    if (!player.duration) return;
    const pct = (player.currentTime / player.duration) * 100;
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('timeDisplay').textContent =
      `${formatTime(player.currentTime)} / ${formatTime(player.duration)}`;
  });
  player.addEventListener('ended', () => {
    isPlaying = false;
    updatePlayIcon(false);
  });
}

function togglePlayback() {
  const player = document.getElementById('audioPlayer');
  if (isPlaying) {
    player.pause();
    isPlaying = false;
  } else {
    player.play();
    isPlaying = true;
  }
  updatePlayIcon(isPlaying);
}

function updatePlayIcon(playing) {
  const btn = document.getElementById('playBtn');
  btn.innerHTML = playing
    ? `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="3" height="8" fill="#00f5c4"/><rect x="7" y="2" width="3" height="8" fill="#00f5c4"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><polygon points="3,2 11,7 3,12" fill="#00f5c4"/></svg>`;
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

// ===== RECORDING =====
const recordBtn = document.getElementById('recordBtn');
recordBtn.addEventListener('click', toggleRecording);

async function toggleRecording() {
  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      recordedChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        const file = new File([blob], 'recorded-audio.webm', { type: 'audio/webm' });
        handleAudioFile(file);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      isRecording = true;
      recordBtn.classList.add('recording');
      document.getElementById('recordLabel').textContent = 'Stop Recording';
    } catch (e) {
      showToast('Microphone access denied.', 'error');
    }
  } else {
    mediaRecorder.stop();
    isRecording = false;
    recordBtn.classList.remove('recording');
    document.getElementById('recordLabel').textContent = 'Record Live Audio';
  }
}

// ===== API KEY =====
function toggleKey() {
  const input = document.getElementById('apiKey');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function checkReadyState() {
  const key = document.getElementById('apiKey').value.trim();
  const btn = document.getElementById('analyzeBtn');
  btn.disabled = !(audioFile && key.startsWith('sk-'));
}

// ===== MAIN ANALYSIS =====
async function analyzeAudio() {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!audioFile || !apiKey) return;

  // Show processing
  document.getElementById('processingSection').style.display = 'flex';
  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('analyzeBtn').disabled = true;

  // Scroll to processing
  setTimeout(() => {
    document.getElementById('processingSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);

  try {
    // Step 1 — extract features
    await activateStep('step1', 600);

    const audioFeatures = extractAudioFeatures(audioBuffer);

    // Step 2 — Whisper transcription
    await activateStep('step2', 800);

    let transcription = '';
    try {
      transcription = await transcribeWithWhisper(audioFile, apiKey);
    } catch (e) {
      transcription = '[Transcription unavailable]';
    }

    // Step 3 — phonetic analysis
    await activateStep('step3', 700);

    // Step 4 — GPT analysis
    await activateStep('step4', 900);

    const analysisResult = await analyzeWithGPT(audioFeatures, transcription, apiKey);

    // Step 5 — verdict
    await activateStep('step5', 500);

    await sleep(400);
    document.getElementById('processingSection').style.display = 'none';
    displayResults(analysisResult, transcription, audioFeatures);

  } catch (err) {
    document.getElementById('processingSection').style.display = 'none';
    document.getElementById('analyzeBtn').disabled = false;

    let msg = 'Analysis failed. ';
    if (err.message?.includes('401')) msg += 'Invalid API key.';
    else if (err.message?.includes('429')) msg += 'Rate limit hit. Try again.';
    else if (err.message?.includes('network')) msg += 'Network error.';
    else msg += err.message || 'Unknown error.';
    showToast(msg, 'error');
  }
}

// ===== AUDIO FEATURE EXTRACTION =====
function extractAudioFeatures(buffer) {
  if (!buffer) return getDefaultFeatures();

  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const duration = buffer.duration;

  // RMS Energy
  let sumSq = 0;
  for (let i = 0; i < data.length; i++) sumSq += data[i] * data[i];
  const rms = Math.sqrt(sumSq / data.length);

  // Zero Crossing Rate
  let zcr = 0;
  for (let i = 1; i < data.length; i++) {
    if ((data[i] >= 0) !== (data[i - 1] >= 0)) zcr++;
  }
  const zcrRate = zcr / (data.length / sampleRate);

  // Dynamic Range
  let maxVal = 0, minVal = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] > maxVal) maxVal = data[i];
    if (data[i] < minVal) minVal = data[i];
  }
  const dynamicRange = (maxVal - minVal);

  // Spectral features via FFT approximation (chunk analysis)
  const fftSize = 2048;
  const numFrames = Math.floor(data.length / fftSize);
  let spectralCentroidSum = 0;
  let spectralFlatnessSum = 0;

  for (let f = 0; f < Math.min(numFrames, 50); f++) {
    const frame = data.slice(f * fftSize, (f + 1) * fftSize);
    // Simplified spectral centroid using energy distribution
    let weightedSum = 0, totalEnergy = 0;
    for (let i = 0; i < frame.length; i++) {
      const energy = frame[i] * frame[i];
      weightedSum += i * energy;
      totalEnergy += energy;
    }
    spectralCentroidSum += totalEnergy > 0 ? weightedSum / totalEnergy : 0;

    // Spectral flatness (ratio of geometric to arithmetic mean)
    const chunks = 16;
    const chunkSize = Math.floor(frame.length / chunks);
    let geoMean = 0, arithMean = 0;
    for (let c = 0; c < chunks; c++) {
      let chunkEnergy = 0;
      for (let i = 0; i < chunkSize; i++) {
        chunkEnergy += Math.abs(frame[c * chunkSize + i]);
      }
      const avg = chunkEnergy / chunkSize + 1e-10;
      geoMean += Math.log(avg);
      arithMean += avg;
    }
    geoMean = Math.exp(geoMean / chunks);
    arithMean = arithMean / chunks;
    spectralFlatnessSum += geoMean / arithMean;
  }

  const spectralCentroid = numFrames > 0 ? spectralCentroidSum / Math.min(numFrames, 50) : 0;
  const spectralFlatness = numFrames > 0 ? spectralFlatnessSum / Math.min(numFrames, 50) : 0;

  // Silence ratio
  const threshold = rms * 0.1;
  let silentSamples = 0;
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) < threshold) silentSamples++;
  }
  const silenceRatio = silentSamples / data.length;

  // Pitch consistency (simple autocorrelation based estimate)
  let pitchVariance = 0;
  const windowSize = Math.floor(sampleRate * 0.05);
  const frames = Math.min(20, Math.floor(data.length / windowSize));
  const rmsValues = [];
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let j = 0; j < windowSize; j++) s += data[i * windowSize + j] ** 2;
    rmsValues.push(Math.sqrt(s / windowSize));
  }
  const avgRms = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;
  pitchVariance = rmsValues.reduce((a, b) => a + Math.abs(b - avgRms), 0) / rmsValues.length / (avgRms + 1e-10);

  return {
    duration: duration.toFixed(2),
    sampleRate,
    rms: rms.toFixed(4),
    zcrRate: Math.round(zcrRate),
    dynamicRange: dynamicRange.toFixed(4),
    spectralCentroid: spectralCentroid.toFixed(2),
    spectralFlatness: spectralFlatness.toFixed(4),
    silenceRatio: (silenceRatio * 100).toFixed(1),
    pitchVariance: pitchVariance.toFixed(3),
    channels: buffer.numberOfChannels,
    fileName: audioFile?.name || 'unknown',
    fileSize: audioFile ? (audioFile.size / 1024).toFixed(1) + ' KB' : 'unknown'
  };
}

function getDefaultFeatures() {
  return { duration: '?', sampleRate: '?', rms: '?', zcrRate: '?', dynamicRange: '?', spectralCentroid: '?', spectralFlatness: '?', silenceRatio: '?', pitchVariance: '?', channels: 1, fileName: 'unknown', fileSize: 'unknown' };
}

// ===== WHISPER TRANSCRIPTION =====
async function transcribeWithWhisper(file, apiKey) {
  const formData = new FormData();
  formData.append('file', file, file.name || 'audio.mp3');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'json');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.text || '';
}

// ===== GPT ANALYSIS =====
async function analyzeWithGPT(features, transcription, apiKey) {
  const systemPrompt = `You are an expert AI audio forensics system specialized in deepfake voice detection.
Your role is to analyze audio features and transcription text to determine if a voice is authentic (human) or synthetic (AI-generated/deepfake).

You analyze multiple signal layers:
1. Spectral artifacts (unnatural frequency distributions, over-smoothed spectra)
2. Prosodic patterns (pitch, rhythm, stress irregularities typical of TTS)
3. Phonetic consistency (natural co-articulation vs. stitched phonemes)
4. Silence and breathing patterns (AI voices often lack natural breath sounds)
5. Micro-variations (humans have natural jitter; AI voices are often too consistent)

IMPORTANT: Respond ONLY in valid JSON format. No markdown, no code blocks, just raw JSON.`;

  const userPrompt = `Analyze this audio sample for deepfake voice detection.

AUDIO FEATURES:
- Duration: ${features.duration}s
- Sample Rate: ${features.sampleRate}Hz
- RMS Energy: ${features.rms}
- Zero Crossing Rate: ${features.zcrRate}/sec
- Dynamic Range: ${features.dynamicRange}
- Spectral Centroid: ${features.spectralCentroid}
- Spectral Flatness: ${features.spectralFlatness}
- Silence Ratio: ${features.silenceRatio}%
- Pitch Variance: ${features.pitchVariance}
- Channels: ${features.channels}

TRANSCRIPTION:
"${transcription || '[No speech detected]'}"

Provide your deepfake detection analysis in this exact JSON structure:
{
  "verdict": "DEEPFAKE" | "AUTHENTIC" | "UNCERTAIN",
  "confidence": <number 0-100>,
  "authenticity_score": <number 0-100, where 0=definitely fake, 100=definitely real>,
  "risk_level": "HIGH" | "MEDIUM" | "LOW",
  "metrics": {
    "spectral_consistency": { "score": <0-100>, "label": "one short phrase", "status": "normal" | "suspicious" | "anomalous" },
    "prosodic_naturalness": { "score": <0-100>, "label": "one short phrase", "status": "normal" | "suspicious" | "anomalous" },
    "phonetic_coherence": { "score": <0-100>, "label": "one short phrase", "status": "normal" | "suspicious" | "anomalous" },
    "breath_pattern": { "score": <0-100>, "label": "one short phrase", "status": "normal" | "suspicious" | "anomalous" },
    "micro_variance": { "score": <0-100>, "label": "one short phrase", "status": "normal" | "suspicious" | "anomalous" },
    "temporal_coherence": { "score": <0-100>, "label": "one short phrase", "status": "normal" | "suspicious" | "anomalous" }
  },
  "report": {
    "executive_summary": "2-3 sentence overview of findings",
    "key_indicators": ["indicator 1", "indicator 2", "indicator 3"],
    "spectral_analysis": "2-3 sentences on spectral findings",
    "prosodic_analysis": "2-3 sentences on prosodic/rhythm findings",
    "recommendation": "1-2 sentences on what action to take"
  },
  "detected_techniques": ["e.g. 'Neural TTS synthesis', 'Voice cloning', etc."] 
}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 1200,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  let text = data.choices[0].message.content.trim();

  // Strip any markdown code fences
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');

  return JSON.parse(text);
}

// ===== DISPLAY RESULTS =====
function displayResults(result, transcription, features) {
  const section = document.getElementById('resultsSection');
  section.style.display = 'flex';

  // Verdict Banner
  const banner = document.getElementById('verdictBanner');
  banner.className = 'verdict-banner ' + result.verdict.toLowerCase();

  const icons = { DEEPFAKE: '⚠️', AUTHENTIC: '✅', UNCERTAIN: '🔍' };
  document.getElementById('verdictIcon').textContent = icons[result.verdict] || '🔍';
  document.getElementById('verdictLabel').textContent = 'VOICE ANALYSIS VERDICT';
  document.getElementById('verdictTitle').textContent = result.verdict === 'DEEPFAKE'
    ? '⚡ SYNTHETIC VOICE DETECTED'
    : result.verdict === 'AUTHENTIC'
      ? '✓ AUTHENTIC VOICE VERIFIED'
      : '? INCONCLUSIVE — MANUAL REVIEW';

  document.getElementById('confValue').textContent = result.confidence + '%';
  document.getElementById('meterScore').textContent = result.authenticity_score + '/100';

  // Meter
  const fill = document.getElementById('meterFill');
  setTimeout(() => {
    fill.style.width = result.authenticity_score + '%';
    if (result.authenticity_score < 35) {
      fill.style.background = 'linear-gradient(90deg, #ff3b5c, #ff6b35)';
      fill.style.color = '#ff3b5c';
    } else if (result.authenticity_score < 65) {
      fill.style.background = 'linear-gradient(90deg, #ff3b5c, #ffae00)';
      fill.style.color = '#ffae00';
    } else {
      fill.style.background = 'linear-gradient(90deg, #0066ff, #00f5c4)';
      fill.style.color = '#00f5c4';
    }
  }, 100);

  // Metrics Grid
  const grid = document.getElementById('metricsGrid');
  grid.innerHTML = '';
  const metricLabels = {
    spectral_consistency: 'SPECTRAL CONSISTENCY',
    prosodic_naturalness: 'PROSODIC NATURALNESS',
    phonetic_coherence: 'PHONETIC COHERENCE',
    breath_pattern: 'BREATH PATTERN',
    micro_variance: 'MICRO VARIANCE',
    temporal_coherence: 'TEMPORAL COHERENCE'
  };

  Object.entries(result.metrics || {}).forEach(([key, val]) => {
    const card = document.createElement('div');
    card.className = 'metric-card';

    const statusColors = { normal: '#00f5c4', suspicious: '#ffae00', anomalous: '#ff3b5c' };
    const color = statusColors[val.status] || '#8aa5cc';
    const barColor = statusColors[val.status] || '#8aa5cc';

    card.innerHTML = `
      <div class="metric-name">${metricLabels[key] || key.toUpperCase()}</div>
      <div class="metric-value" style="color:${color}">${val.score}<span style="font-size:14px;color:var(--text-dim)">/100</span></div>
      <div class="metric-bar"><div class="metric-bar-fill" style="background:${barColor};width:0%" data-target="${val.score}"></div></div>
      <div class="metric-status" style="color:${color}">${val.label}</div>
    `;
    grid.appendChild(card);
  });

  // Animate metric bars
  setTimeout(() => {
    document.querySelectorAll('.metric-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.target + '%';
    });
  }, 200);

  // Report
  const r = result.report || {};
  const techniques = (result.detected_techniques || []).join(', ') || 'None identified';

  const reportHtml = `
    <div class="report-section">
      <div class="report-title">EXECUTIVE SUMMARY</div>
      <p>${r.executive_summary || '—'}</p>
    </div>
    <div class="report-section">
      <div class="report-title">KEY INDICATORS</div>
      <p>${(r.key_indicators || []).map((i, n) => `${n + 1}. ${i}`).join('<br>')}</p>
    </div>
    <div class="report-section">
      <div class="report-title">SPECTRAL ANALYSIS</div>
      <p>${r.spectral_analysis || '—'}</p>
    </div>
    <div class="report-section">
      <div class="report-title">PROSODIC ANALYSIS</div>
      <p>${r.prosodic_analysis || '—'}</p>
    </div>
    <div class="report-section">
      <div class="report-title">DETECTED SYNTHESIS TECHNIQUES</div>
      <p>${techniques}</p>
    </div>
    <div class="report-section">
      <div class="report-title">RISK LEVEL</div>
      <p style="color:${result.risk_level === 'HIGH' ? 'var(--danger)' : result.risk_level === 'MEDIUM' ? 'var(--warn)' : 'var(--safe)'}">${result.risk_level || '—'}</p>
    </div>
    <div class="report-section">
      <div class="report-title">RECOMMENDATION</div>
      <p>${r.recommendation || '—'}</p>
    </div>
    <div class="report-section">
      <div class="report-title">AUDIO METADATA</div>
      <p>File: ${features.fileName} · ${features.fileSize} · Duration: ${features.duration}s · ${features.sampleRate}Hz · ${features.channels}ch</p>
    </div>
  `;

  document.getElementById('reportBody').innerHTML = reportHtml;

  // Build plain text report for copy
  reportText = buildPlainReport(result, transcription, features);

  // Transcription
  if (transcription && transcription !== '[Transcription unavailable]') {
    document.getElementById('transcriptCard').style.display = 'block';
    document.getElementById('transcriptText').textContent = transcription;
  }

  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Save to history
  if (typeof saveAnalysisToHistory === 'function') {
    saveAnalysisToHistory(result, audioFile ? audioFile.name : 'recorded-audio.webm');
  }
}

function buildPlainReport(result, transcription, features) {
  return `
VOICESHIELD DEEPFAKE DETECTION REPORT
======================================
Verdict: ${result.verdict}
Confidence: ${result.confidence}%
Authenticity Score: ${result.authenticity_score}/100
Risk Level: ${result.risk_level}

EXECUTIVE SUMMARY
${result.report?.executive_summary || '—'}

KEY INDICATORS
${(result.report?.key_indicators || []).map((i, n) => `${n + 1}. ${i}`).join('\n')}

SPECTRAL ANALYSIS
${result.report?.spectral_analysis || '—'}

PROSODIC ANALYSIS
${result.report?.prosodic_analysis || '—'}

DETECTED TECHNIQUES: ${(result.detected_techniques || []).join(', ') || 'None'}

RECOMMENDATION
${result.report?.recommendation || '—'}

AUDIO METADATA
File: ${features.fileName} | Duration: ${features.duration}s | Sample Rate: ${features.sampleRate}Hz

TRANSCRIPTION
${transcription || '[None]'}

Generated by VoiceShield — PaladinAI Deepfake Detection Demo
`.trim();
}

// ===== COPY REPORT =====
function copyReport() {
  navigator.clipboard.writeText(reportText).then(() => {
    showToast('Report copied to clipboard!', 'success');
  });
}

// ===== RESET =====
function resetApp() {
  audioFile = null;
  audioBuffer = null;

  document.getElementById('uploadCard').classList.remove('has-file');
  document.querySelector('.upload-label').textContent = 'Drop audio file here';
  document.querySelector('.upload-label').style.color = '';
  document.querySelector('.upload-sub').textContent = 'MP3, WAV, M4A, OGG — up to 25MB';
  document.getElementById('fileInput').value = '';
  document.getElementById('waveformSection').style.display = 'none';
  document.getElementById('processingSection').style.display = 'none';
  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('transcriptCard').style.display = 'none';
  document.getElementById('analyzeBtn').disabled = true;

  // Reset processing steps
  ['step1', 'step2', 'step3', 'step4', 'step5'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove('active', 'done');
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== PROCESSING STEPS =====
async function activateStep(stepId, delay) {
  // Mark previous as done
  const steps = ['step1', 'step2', 'step3', 'step4', 'step5'];
  const idx = steps.indexOf(stepId);
  if (idx > 0) {
    document.getElementById(steps[idx - 1]).classList.remove('active');
    document.getElementById(steps[idx - 1]).classList.add('done');
  }
  document.getElementById(stepId).classList.add('active');
  await sleep(delay);
}

// ===== TOAST =====
let toastTimeout;
function showToast(message, type = '') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ===== THEME =====
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    updateThemeIcons(true);
  } else {
    updateThemeIcons(false);
  }
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  updateThemeIcons(isLight);

  // Refresh waveform if exists
  if (audioBuffer) {
    drawWaveform(audioBuffer);
  }
}

function updateThemeIcons(isLight) {
  const sun = document.getElementById('sunIcon');
  const moon = document.getElementById('moonIcon');
  if (isLight) {
    sun.style.display = 'block';
    moon.style.display = 'none';
  } else {
    sun.style.display = 'none';
    moon.style.display = 'block';
  }
}

// ===== NAVIGATION =====
function switchView(viewId) {
  const target = document.getElementById(`${viewId}-view`);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth' });
  }
}

function setupScrollBehaviors() {
  const header = document.querySelector('header');
  let lastScrollY = window.scrollY;

  // 1. Hide on Scroll
  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    if (currentScrollY > lastScrollY && currentScrollY > 100) {
      header.classList.add('header-hidden');
    } else {
      header.classList.remove('header-hidden');
    }
    lastScrollY = currentScrollY;
  }, { passive: true });

  // 2. Scroll Spy (Intersection Observer)
  const options = {
    root: null,
    rootMargin: '-100px 0px -40% 0px',
    threshold: 0
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const viewId = entry.target.id.replace('-view', '');
        updateNavActiveState(viewId);
      }
    });
  }, options);

  document.querySelectorAll('.app-view').forEach(view => {
    observer.observe(view);
  });
}

function updateNavActiveState(viewId) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.textContent.toLowerCase() === viewId.toLowerCase()) {
      item.classList.add('active');
    }
  });
}

// ===== HISTORY =====
let reportsHistory = [];

function initHistory() {
  const saved = localStorage.getItem('reportsHistory');
  if (saved) {
    reportsHistory = JSON.parse(saved);
    renderHistory();
  }
}

function saveAnalysisToHistory(result, filename) {
  const entry = {
    id: Date.now(),
    timestamp: new Date().toLocaleString(),
    filename: filename,
    verdict: result.verdict,
    confidence: result.confidence,
    authenticity_score: result.authenticity_score,
    result: result // Store full result for preview
  };

  reportsHistory.unshift(entry);
  // Keep only last 20
  if (reportsHistory.length > 20) reportsHistory.pop();

  localStorage.setItem('reportsHistory', JSON.stringify(reportsHistory));
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('reportsList');
  if (!list) return;

  list.innerHTML = reportsHistory.length === 0
    ? '<tr><td colspan="5" style="text-align:center;opacity:0.5;padding:40px;">No forensic data available yet.</td></tr>'
    : reportsHistory.map(entry => `
      <tr>
        <td>${entry.timestamp}</td>
        <td>${entry.filename}</td>
        <td><span class="badge ${entry.verdict.toLowerCase()}">${entry.verdict}</span></td>
        <td>${entry.confidence}%</td>
        <td><button class="btn-text" onclick="viewHistoryItem(${entry.id})">View</button></td>
      </tr>
    `).join('');
}

function viewHistoryItem(id) {
  const entry = reportsHistory.find(e => e.id === id);
  if (entry) {
    // Switch to detector view
    switchView('detector');
    // Display result
    displayResults(entry.result, "", {});
    // Scroll to results
    document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
  }
}

// ===== UTILS =====
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
