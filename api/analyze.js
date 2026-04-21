import { OpenAI } from 'openai';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false, // Disable built-in body parser for formidable
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const form = formidable({});

  try {
    const [fields, files] = await form.parse(req);

    const audioFile = files.file ? files.file[0] : null;
    const featuresLine = fields.features ? fields.features[0] : null;

    if (!audioFile) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const features = featuresLine ? JSON.parse(featuresLine) : {};

    // 1. Transcribe with Whisper
    // Determine a safe filename with extension
    const origName = audioFile.originalFilename || '';
    const mimeExt = audioFile.mimetype ? audioFile.mimetype.split('/').pop() : 'webm';
    const extension = origName.includes('.') ? origName.split('.').pop() : mimeExt;
    const fileName = origName.includes('.') ? origName : `audio.${extension}`;

    console.log('[DEBUG] audioFile info:', {
      filepath: audioFile.filepath,
      originalFilename: audioFile.originalFilename,
      mimetype: audioFile.mimetype,
      size: audioFile.size,
      resolvedExtension: extension,
      resolvedFileName: fileName,
    });

    // Read file as buffer and wrap with toFile for proper filename
    const fileBuffer = fs.readFileSync(audioFile.filepath);
    const file = await OpenAI.toFile(fileBuffer, fileName);

    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
    });

    // 2. Analyze with GPT-4o
    const systemPrompt = `You are an expert AI audio forensics system specialized in deepfake voice detection.
Your role is to analyze audio features and transcription text to determine if a voice is authentic (human) or synthetic (AI-generated/deepfake).

Analyze multiple signal layers:
1. Spectral artifacts (unnatural frequency distributions, over-smoothed spectra)
2. Prosodic patterns (pitch, rhythm, stress irregularities typical of TTS)
3. Phonetic consistency (natural co-articulation vs. stitched phonemes)
4. Silence and breathing patterns (AI voices often lack natural breath sounds)
5. Micro-variations (humans have natural jitter; AI voices are often too consistent)

IMPORTANT: Respond ONLY in valid JSON format.`;

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
"${transcription.text || '[No speech detected]'}"

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

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    });

    const analysisResult = JSON.parse(completion.choices[0].message.content);

    // Cleanup temporary files
    try {
      if (fs.existsSync(audioFile.filepath)) fs.unlinkSync(audioFile.filepath);
    } catch (e) {
      console.error('Cleanup error:', e);
    }

    return res.status(200).json({
      result: analysisResult,
      transcription: transcription.text
    });

  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
