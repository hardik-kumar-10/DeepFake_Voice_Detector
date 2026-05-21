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

function handleAudioFile(file) {
  audioFile = file;
  document.getElementById('uploadCard').classList.add('has-file');

  const label = document.querySelector('.upload-label');
  label.textContent = `✓ ${file.name}`;
  label.style.color = 'var(--accent)';

  const sub = document.querySelector('.upload-sub');
  sub.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB · ${file.type}`;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioBuffer = await audioContext.decodeAudioData(e.target.result);
      drawWaveform(audioBuffer);

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

      const mimeTypes = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav'];
      const supportedType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';

      mediaRecorder = new MediaRecorder(stream, supportedType ? { mimeType: supportedType } : {});
      recordedChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const type = supportedType || 'audio/webm';
        const extension = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(recordedChunks, { type });
        const file = new File([blob], `recorded-audio.${extension}`, { type });
        handleAudioFile(file);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      isRecording = true;
      recordBtn.classList.add('recording');
      document.getElementById('recordLabel').textContent = 'Stop Recording';
    } catch (e) {
      showToast('Microphone access denied or not found.', 'error');
    }
  } else {
    mediaRecorder.stop();
    isRecording = false;
    recordBtn.classList.remove('recording');
    document.getElementById('recordLabel').textContent = 'Record Live Audio';
  }
}

// ===== API KEY =====
function checkReadyState() {
  const btn = document.getElementById('analyzeBtn');
  btn.disabled = !audioFile;
}

// ===== MAIN ANALYSIS =====
async function analyzeAudio() {
  if (!audioFile) return;

  document.getElementById('processingSection').style.display = 'flex';
  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('analyzeBtn').disabled = true;

  setTimeout(() => {
    document.getElementById('processingSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);

  try {
    await activateStep('step1', 600);
    const audioFeatures = extractAudioFeatures(audioBuffer);

    await activateStep('step2', 400);

    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('features', JSON.stringify(audioFeatures));

    const response = await fetch('/api/analyze', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || `HTTP ${response.status}`);
    }

    await activateStep('step3', 500);
    const data = await response.json();

    await activateStep('step4', 600);
    await activateStep('step5', 400);

    await sleep(400);
    document.getElementById('processingSection').style.display = 'none';
    displayResults(data.result, data.transcription, audioFeatures);

  } catch (err) {
    document.getElementById('processingSection').style.display = 'none';
    document.getElementById('analyzeBtn').disabled = false;

    let msg = 'Analysis failed. ';
    if (err.message?.includes('401')) msg += 'API Authentication Error.';
    else if (err.message?.includes('429')) msg += 'Rate limit hit. Try again.';
    else if (err.message?.includes('network')) msg += 'Network error.';
    else msg += err.message || 'Unknown error.';
    showToast(msg, 'error');
  }
}

// ===== ADVANCED AUDIO FEATURE EXTRACTION =====
function extractAudioFeatures(buffer) {
  if (!buffer) return getDefaultFeatures();

  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const duration = buffer.duration;
  const N = data.length;

  // ── 1. RMS Energy ──
  let sumSq = 0;
  for (let i = 0; i < N; i++) sumSq += data[i] * data[i];
  const rms = Math.sqrt(sumSq / N);

  // ── 2. Zero Crossing Rate ──
  let zcr = 0;
  for (let i = 1; i < N; i++) {
    if ((data[i] >= 0) !== (data[i - 1] >= 0)) zcr++;
  }
  const zcrRate = zcr / (N / sampleRate);

  // ── 3. Dynamic Range ──
  let maxVal = 0, minVal = 0;
  for (let i = 0; i < N; i++) {
    if (data[i] > maxVal) maxVal = data[i];
    if (data[i] < minVal) minVal = data[i];
  }
  const dynamicRange = maxVal - minVal;

  // ── 4. Silence Ratio ──
  const threshold = rms * 0.15;
  let silentSamples = 0;
  for (let i = 0; i < N; i++) {
    if (Math.abs(data[i]) < threshold) silentSamples++;
  }
  const silenceRatio = silentSamples / N;

  // ── 5. Frame-based analysis (20ms frames) ──
  const frameSize = Math.floor(sampleRate * 0.02); // 20ms
  const hopSize = Math.floor(frameSize / 2);
  const numFrames = Math.floor((N - frameSize) / hopSize);

  const frameRMS = [];
  const frameZCR = [];
  const frameEnergy = [];

  for (let f = 0; f < numFrames; f++) {
    const start = f * hopSize;
    let fRMS = 0, fZCR = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = data[start + i] || 0;
      fRMS += s * s;
      if (i > 0 && (s >= 0) !== ((data[start + i - 1] || 0) >= 0)) fZCR++;
    }
    frameRMS.push(Math.sqrt(fRMS / frameSize));
    frameZCR.push(fZCR / frameSize);
    frameEnergy.push(fRMS / frameSize);
  }

  // ── 6. JITTER (pitch period perturbation) ──
  // Estimate using autocorrelation on voiced frames
  // Jitter measures cycle-to-cycle variation in fundamental frequency
  const voicedFrames = frameRMS.filter(r => r > rms * 0.3);
  const jitter = computeJitter(data, sampleRate, rms);

  // ── 7. SHIMMER (amplitude perturbation) ──
  // Measures cycle-to-cycle variation in amplitude — humans have ~3-5% shimmer
  const shimmer = computeShimmer(frameRMS);

  // ── 8. Harmonics-to-Noise Ratio (HNR) ──
  // Real voices: HNR 15-25 dB. TTS voices: unusually high (>30 dB, "too clean")
  const hnr = computeHNR(data, sampleRate);

  // ── 9. Spectral features via FFT ──
  const fftSize = 2048;
  const numFFTFrames = Math.floor(N / fftSize);
  let spectralCentroidSum = 0;
  let spectralFlatnessSum = 0;
  let spectralRolloffSum = 0;
  let spectralFluxSum = 0;
  let prevSpectrum = null;

  for (let f = 0; f < Math.min(numFFTFrames, 100); f++) {
    const frame = [];
    for (let i = 0; i < fftSize; i++) {
      frame.push(data[f * fftSize + i] || 0);
    }

    // Apply Hann window
    const windowed = frame.map((s, i) => s * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / fftSize)));

    // Compute magnitude spectrum (simplified DFT on sub-bands)
    const halfSize = fftSize / 2;
    const magnitudes = computeSimpleMagnitudeSpectrum(windowed, halfSize);

    // Spectral centroid
    let weightedSum = 0, totalMag = 0;
    for (let i = 0; i < halfSize; i++) {
      weightedSum += i * magnitudes[i];
      totalMag += magnitudes[i];
    }
    spectralCentroidSum += totalMag > 0 ? (weightedSum / totalMag) * (sampleRate / fftSize) : 0;

    // Spectral flatness (Wiener entropy) — TTS has very high flatness (too noise-like)
    let geoSum = 0, arithSum = 0, count = 0;
    for (let i = 1; i < halfSize; i++) {
      if (magnitudes[i] > 0) {
        geoSum += Math.log(magnitudes[i]);
        arithSum += magnitudes[i];
        count++;
      }
    }
    const geoMean = count > 0 ? Math.exp(geoSum / count) : 0;
    const arithMean = count > 0 ? arithSum / count : 1;
    spectralFlatnessSum += geoMean / (arithMean + 1e-10);

    // Spectral rolloff (frequency below which 85% of energy lies)
    const totalEnergy = magnitudes.reduce((a, b) => a + b * b, 0);
    let cumEnergy = 0;
    for (let i = 0; i < halfSize; i++) {
      cumEnergy += magnitudes[i] * magnitudes[i];
      if (cumEnergy >= 0.85 * totalEnergy) {
        spectralRolloffSum += i * (sampleRate / fftSize);
        break;
      }
    }

    // Spectral flux — measures change between frames
    if (prevSpectrum) {
      let flux = 0;
      for (let i = 0; i < halfSize; i++) {
        const diff = magnitudes[i] - prevSpectrum[i];
        flux += diff * diff;
      }
      spectralFluxSum += Math.sqrt(flux / halfSize);
    }
    prevSpectrum = magnitudes;
  }

  const validFFTFrames = Math.min(numFFTFrames, 100);
  const spectralCentroid = validFFTFrames > 0 ? spectralCentroidSum / validFFTFrames : 0;
  const spectralFlatness = validFFTFrames > 0 ? spectralFlatnessSum / validFFTFrames : 0;
  const spectralRolloff = validFFTFrames > 0 ? spectralRolloffSum / validFFTFrames : 0;
  const spectralFlux = validFFTFrames > 1 ? spectralFluxSum / (validFFTFrames - 1) : 0;

  // ── 10. Pitch Variance (RMS-based) ──
  const avgFrameRMS = frameRMS.reduce((a, b) => a + b, 0) / (frameRMS.length || 1);
  const pitchVariance = frameRMS.reduce((a, b) => a + Math.abs(b - avgFrameRMS), 0) /
    ((frameRMS.length || 1) * (avgFrameRMS + 1e-10));

  // ── 11. Energy Contour Smoothness ──
  // AI voices have unnaturally smooth energy contours
  const energySmoothnessScore = computeEnergyContourSmoothness(frameRMS);

  // ── 12. Local Peak Variance ──
  // Natural speech has irregular local amplitude peaks; TTS is too regular
  const localPeakVariance = computeLocalPeakVariance(data, sampleRate);

  // ── 13. Sub-band Energy Ratio ──
  // Human voice has specific energy distribution across frequency bands
  const subBandRatios = computeSubBandEnergyRatios(data, sampleRate, fftSize);

  // ── 14. Voiced/Unvoiced Frame Ratio ──
  const voicedRatio = frameRMS.filter(r => r > rms * 0.25).length / (frameRMS.length || 1);

  // ── 15. Temporal Irregularity Index ──
  // Measures how irregular speech energy bursts are — humans are more irregular
  const temporalIrregularity = computeTemporalIrregularity(frameEnergy);

  return {
    duration: duration.toFixed(2),
    sampleRate,
    channels: buffer.numberOfChannels,
    fileName: audioFile?.name || 'unknown',
    fileSize: audioFile ? (audioFile.size / 1024).toFixed(1) + ' KB' : 'unknown',

    // Basic features
    rms: rms.toFixed(4),
    zcrRate: Math.round(zcrRate),
    dynamicRange: dynamicRange.toFixed(4),
    silenceRatio: (silenceRatio * 100).toFixed(1),
    pitchVariance: pitchVariance.toFixed(3),
    voicedRatio: (voicedRatio * 100).toFixed(1),

    // Spectral features
    spectralCentroid: spectralCentroid.toFixed(1),
    spectralFlatness: spectralFlatness.toFixed(4),
    spectralRolloff: spectralRolloff.toFixed(1),
    spectralFlux: spectralFlux.toFixed(4),

    // Advanced forensic features
    jitter: jitter.toFixed(4),           // % — humans: 0.2-1.5%, TTS: <0.1% or >3%
    shimmer: shimmer.toFixed(4),         // % — humans: 2-8%, TTS: <1% or unnaturally high
    hnr: hnr.toFixed(2),                 // dB — humans: 15-25, TTS: >30 (too clean)
    energySmoothness: energySmoothnessScore.toFixed(4),  // lower = more natural
    localPeakVariance: localPeakVariance.toFixed(4),     // higher = more natural
    temporalIrregularity: temporalIrregularity.toFixed(4),

    // Sub-band energy ratios
    subBand_0_500: subBandRatios.low.toFixed(3),
    subBand_500_2k: subBandRatios.mid.toFixed(3),
    subBand_2k_4k: subBandRatios.high.toFixed(3),
    subBand_4k_8k: subBandRatios.vhigh.toFixed(3),
  };
}

// ── FFT Helpers ──

function computeSimpleMagnitudeSpectrum(signal, outputSize) {
  // Goertzel-based magnitude estimation per frequency bin (faster than full FFT)
  const N = signal.length;
  const magnitudes = new Float32Array(outputSize);
  for (let k = 0; k < outputSize; k++) {
    const omega = 2 * Math.PI * k / N;
    let real = 0, imag = 0;
    for (let n = 0; n < N; n += 4) { // Stride for speed
      real += signal[n] * Math.cos(omega * n);
      imag -= signal[n] * Math.sin(omega * n);
    }
    magnitudes[k] = Math.sqrt(real * real + imag * imag);
  }
  return magnitudes;
}

// ── Jitter Computation ──
// Uses autocorrelation to find pitch periods, then measures period-to-period variation
function computeJitter(data, sampleRate, rms) {
  if (rms < 0.001) return 0.5; // Silence default

  // Find voiced segments using short-window autocorrelation
  const windowSize = Math.floor(sampleRate * 0.04); // 40ms window
  const minPeriod = Math.floor(sampleRate / 500);    // max 500 Hz
  const maxPeriod = Math.floor(sampleRate / 60);     // min 60 Hz

  const periods = [];
  const stepSize = Math.floor(windowSize / 2);
  const numWindows = Math.min(40, Math.floor(data.length / stepSize));

  for (let w = 0; w < numWindows; w++) {
    const start = w * stepSize;
    // Check if voiced (energy above threshold)
    let energy = 0;
    for (let i = 0; i < windowSize && start + i < data.length; i++) {
      energy += data[start + i] * data[start + i];
    }
    if (Math.sqrt(energy / windowSize) < rms * 0.3) continue;

    // Normalized autocorrelation
    let bestPeriod = minPeriod;
    let bestCorr = -1;

    for (let lag = minPeriod; lag <= maxPeriod; lag++) {
      let corr = 0, norm1 = 0, norm2 = 0;
      for (let i = 0; i < windowSize - lag && start + i + lag < data.length; i++) {
        corr += data[start + i] * data[start + i + lag];
        norm1 += data[start + i] * data[start + i];
        norm2 += data[start + i + lag] * data[start + i + lag];
      }
      const normCorr = corr / (Math.sqrt(norm1 * norm2) + 1e-10);
      if (normCorr > bestCorr) {
        bestCorr = normCorr;
        bestPeriod = lag;
      }
    }

    if (bestCorr > 0.3) { // Only use well-correlated (voiced) frames
      periods.push(bestPeriod);
    }
  }

  if (periods.length < 3) return 0.8; // Not enough voiced frames — return moderate value

  // Jitter = mean absolute difference of consecutive periods / mean period
  let jitterSum = 0;
  for (let i = 1; i < periods.length; i++) {
    jitterSum += Math.abs(periods[i] - periods[i - 1]);
  }
  const meanPeriod = periods.reduce((a, b) => a + b, 0) / periods.length;
  const jitter = (jitterSum / (periods.length - 1)) / (meanPeriod + 1e-10);

  // Normalize to percentage-like range
  return Math.min(jitter * 100, 15);
}

// ── Shimmer Computation ──
// Measures amplitude variation between consecutive voiced cycles
function computeShimmer(frameRMS) {
  const voiced = frameRMS.filter(r => r > 0.001);
  if (voiced.length < 3) return 3.0; // Default to mid-range

  let shimmerSum = 0;
  for (let i = 1; i < voiced.length; i++) {
    shimmerSum += Math.abs(voiced[i] - voiced[i - 1]) / (voiced[i - 1] + 1e-10);
  }

  const shimmer = (shimmerSum / (voiced.length - 1)) * 100;
  return Math.min(shimmer, 30);
}

// ── Harmonics-to-Noise Ratio ──
// Computed via autocorrelation: high HNR = clean/periodic, low = noisy/natural
function computeHNR(data, sampleRate) {
  const windowSize = Math.floor(sampleRate * 0.04);
  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.floor(sampleRate / 60);

  let hnrSum = 0, count = 0;
  const stepSize = windowSize;
  const numWindows = Math.min(20, Math.floor(data.length / stepSize));

  for (let w = 0; w < numWindows; w++) {
    const start = w * stepSize;
    let energy = 0;
    for (let i = 0; i < windowSize && start + i < data.length; i++) {
      energy += data[start + i] * data[start + i];
    }
    if (energy < 1e-8) continue;

    // Compute autocorrelation
    let r0 = 0, rMax = 0;
    for (let i = 0; i < windowSize && start + i < data.length; i++) {
      r0 += data[start + i] * data[start + i];
    }

    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let i = 0; i < windowSize - lag && start + i + lag < data.length; i++) {
        r += data[start + i] * data[start + i + lag];
      }
      if (r > rMax) rMax = r;
    }

    if (r0 > 0 && rMax > 0 && rMax < r0) {
      const ratio = rMax / (r0 - rMax + 1e-10);
      hnrSum += 10 * Math.log10(ratio + 1e-10);
      count++;
    }
  }

  if (count === 0) return 15; // Default human-like HNR
  return Math.max(0, Math.min(50, hnrSum / count));
}

// ── Energy Contour Smoothness ──
// TTS voices have unnaturally smooth energy contours; measures 2nd derivative variance
function computeEnergyContourSmoothness(frameRMS) {
  if (frameRMS.length < 3) return 0.5;

  let variance = 0;
  for (let i = 1; i < frameRMS.length - 1; i++) {
    const d2 = frameRMS[i + 1] - 2 * frameRMS[i] + frameRMS[i - 1];
    variance += d2 * d2;
  }
  return variance / (frameRMS.length - 2);
}

// ── Local Peak Variance ──
// Natural voices have variable local amplitude peaks; TTS is too regular
function computeLocalPeakVariance(data, sampleRate) {
  const windowSize = Math.floor(sampleRate * 0.01); // 10ms windows
  const peaks = [];

  for (let i = 0; i < data.length - windowSize; i += windowSize) {
    let maxAmp = 0;
    for (let j = 0; j < windowSize; j++) {
      if (Math.abs(data[i + j]) > maxAmp) maxAmp = Math.abs(data[i + j]);
    }
    peaks.push(maxAmp);
  }

  const meanPeak = peaks.reduce((a, b) => a + b, 0) / (peaks.length || 1);
  const variance = peaks.reduce((a, b) => a + (b - meanPeak) ** 2, 0) / (peaks.length || 1);
  return Math.sqrt(variance) / (meanPeak + 1e-10);
}

// ── Sub-band Energy Ratios ──
function computeSubBandEnergyRatios(data, sampleRate, fftSize) {
  // Sample a few frames for sub-band analysis
  const frame = data.slice(0, fftSize);
  const windowed = Array.from(frame).map((s, i) => s * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / fftSize)));
  const magnitudes = computeSimpleMagnitudeSpectrum(windowed, fftSize / 2);

  const binHz = sampleRate / fftSize;
  const bins = {
    low: [0, Math.floor(500 / binHz)],
    mid: [Math.floor(500 / binHz), Math.floor(2000 / binHz)],
    high: [Math.floor(2000 / binHz), Math.floor(4000 / binHz)],
    vhigh: [Math.floor(4000 / binHz), Math.floor(Math.min(8000, sampleRate / 2) / binHz)],
  };

  const totalEnergy = magnitudes.reduce((a, b) => a + b * b, 0) + 1e-10;
  const result = {};
  for (const [name, [start, end]] of Object.entries(bins)) {
    let energy = 0;
    for (let i = start; i < Math.min(end, magnitudes.length); i++) {
      energy += magnitudes[i] * magnitudes[i];
    }
    result[name] = energy / totalEnergy;
  }
  return result;
}

// ── Temporal Irregularity ──
function computeTemporalIrregularity(frameEnergy) {
  if (frameEnergy.length < 4) return 0.5;

  const diffs = [];
  for (let i = 1; i < frameEnergy.length; i++) {
    diffs.push(Math.abs(frameEnergy[i] - frameEnergy[i - 1]));
  }
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance = diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / diffs.length;
  return Math.sqrt(variance) / (mean + 1e-10);
}

function getDefaultFeatures() {
  return {
    duration: '?', sampleRate: '?', rms: '?', zcrRate: '?', dynamicRange: '?',
    spectralCentroid: '?', spectralFlatness: '?', spectralRolloff: '?', spectralFlux: '?',
    silenceRatio: '?', pitchVariance: '?', voicedRatio: '?',
    jitter: '?', shimmer: '?', hnr: '?',
    energySmoothness: '?', localPeakVariance: '?', temporalIrregularity: '?',
    subBand_0_500: '?', subBand_500_2k: '?', subBand_2k_4k: '?', subBand_4k_8k: '?',
    channels: 1, fileName: 'unknown', fileSize: 'unknown'
  };
}


// ===== DISPLAY RESULTS =====
function displayResults(result, transcription, features) {
  const section = document.getElementById('resultsSection');
  section.style.display = 'flex';

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

    card.innerHTML = `
      <div class="metric-name">${metricLabels[key] || key.toUpperCase()}</div>
      <div class="metric-value" style="color:${color}">${val.score}<span style="font-size:14px;color:var(--text-dim)">/100</span></div>
      <div class="metric-bar"><div class="metric-bar-fill" style="background:${color};width:0%" data-target="${val.score}"></div></div>
      <div class="metric-status" style="color:${color}">${val.label}</div>
    `;
    grid.appendChild(card);
  });

  setTimeout(() => {
    document.querySelectorAll('.metric-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.target + '%';
    });
  }, 200);

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
      <div class="report-title">FORENSIC BIOMARKERS</div>
      <p>${r.forensic_biomarkers || '—'}</p>
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
      <div class="report-title">FORENSIC BIOMARKER READINGS</div>
      <p>
        Jitter: ${features.jitter}% &nbsp;|&nbsp;
        Shimmer: ${features.shimmer}% &nbsp;|&nbsp;
        HNR: ${features.hnr} dB &nbsp;|&nbsp;
        ZCR: ${features.zcrRate}/s &nbsp;|&nbsp;
        Spectral Flux: ${features.spectralFlux}
        <br>
        Energy Smoothness: ${features.energySmoothness} &nbsp;|&nbsp;
        Temporal Irregularity: ${features.temporalIrregularity} &nbsp;|&nbsp;
        Voiced Ratio: ${features.voicedRatio}%
      </p>
    </div>
    <div class="report-section">
      <div class="report-title">AUDIO METADATA</div>
      <p>File: ${features.fileName} · ${features.fileSize} · Duration: ${features.duration}s · ${features.sampleRate}Hz · ${features.channels}ch</p>
    </div>
  `;

  document.getElementById('reportBody').innerHTML = reportHtml;
  reportText = buildPlainReport(result, transcription, features);

  if (transcription && transcription !== '[Transcription unavailable]') {
    document.getElementById('transcriptCard').style.display = 'block';
    document.getElementById('transcriptText').textContent = transcription;
  }

  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

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

FORENSIC BIOMARKERS
${result.report?.forensic_biomarkers || '—'}

DETECTED TECHNIQUES: ${(result.detected_techniques || []).join(', ') || 'None'}

RECOMMENDATION
${result.report?.recommendation || '—'}

FORENSIC BIOMARKER READINGS
Jitter: ${features.jitter}% | Shimmer: ${features.shimmer}% | HNR: ${features.hnr} dB
ZCR: ${features.zcrRate}/s | Spectral Flux: ${features.spectralFlux}
Energy Smoothness: ${features.energySmoothness} | Temporal Irregularity: ${features.temporalIrregularity}

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

  ['step1', 'step2', 'step3', 'step4', 'step5'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove('active', 'done');
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== PROCESSING STEPS =====
async function activateStep(stepId, delay) {
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
  if (audioBuffer) drawWaveform(audioBuffer);
}

function updateThemeIcons(isLight) {
  const sun = document.getElementById('sunIcon');
  const moon = document.getElementById('moonIcon');
  if (isLight) { sun.style.display = 'block'; moon.style.display = 'none'; }
  else { sun.style.display = 'none'; moon.style.display = 'block'; }
}

// ===== NAVIGATION =====
function switchView(viewId) {
  const target = document.getElementById(`${viewId}-view`);
  if (target) target.scrollIntoView({ behavior: 'smooth' });
}

function setupScrollBehaviors() {
  const header = document.querySelector('header');
  let lastScrollY = window.scrollY;

  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    if (currentScrollY > lastScrollY && currentScrollY > 100) {
      header.classList.add('header-hidden');
    } else {
      header.classList.remove('header-hidden');
    }
    lastScrollY = currentScrollY;
  }, { passive: true });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const viewId = entry.target.id.replace('-view', '');
        updateNavActiveState(viewId);
      }
    });
  }, { root: null, rootMargin: '-100px 0px -40% 0px', threshold: 0 });

  document.querySelectorAll('.app-view').forEach(view => observer.observe(view));
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
    filename,
    verdict: result.verdict,
    confidence: result.confidence,
    authenticity_score: result.authenticity_score,
    result
  };

  reportsHistory.unshift(entry);
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
    switchView('detector');
    displayResults(entry.result, "", {});
    document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
  }
}

// ===== UTILS =====
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
