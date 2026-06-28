/* Shared ElevenLabs request builder.
 *
 * Used today by tools/generate-audio.mjs. Designed to be reused unchanged by a
 * future serverless TTS proxy so that pre-generated clips and on-demand audio
 * come out byte-identical (same model + voice settings).
 */

export const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1/text-to-speech";

// One place to tune the voice. "Gentle, natural, warm, slightly mouse-like":
// keep style at 0 (style exaggeration pushes toward theatrical/robotic), a
// moderate stability for warmth without wobble, high similarity for consistency.
export const DEFAULT_VOICE_SETTINGS = Object.freeze({
  stability: 0.5,
  similarity_boost: 0.8,
  style: 0.0,
  use_speaker_boost: true
});

export const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
export const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";

/**
 * Build the JSON body for an ElevenLabs text-to-speech request.
 * @param {string} text - the text to synthesize (placeholders already filled).
 * @param {object} [opts]
 * @param {string} [opts.modelId] - override the TTS model.
 * @param {object} [opts.voiceSettings] - partial overrides merged over defaults.
 * @returns {object} request body suitable for JSON.stringify.
 */
export function buildTtsRequest(text, opts = {}) {
  return {
    text,
    model_id: opts.modelId || DEFAULT_MODEL_ID,
    voice_settings: { ...DEFAULT_VOICE_SETTINGS, ...(opts.voiceSettings || {}) }
  };
}

/**
 * Build the full ElevenLabs endpoint URL for a voice.
 * @param {string} voiceId
 * @param {string} [outputFormat]
 */
export function ttsUrl(voiceId, outputFormat = DEFAULT_OUTPUT_FORMAT) {
  return `${ELEVENLABS_BASE}/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`;
}
