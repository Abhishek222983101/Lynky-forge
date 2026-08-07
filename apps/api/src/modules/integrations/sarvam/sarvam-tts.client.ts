import { Injectable } from "@nestjs/common";
import { env } from "@/common/config/env";
import { AppError } from "@/common/errors/app-error";

export type SarvamSpeechInput = {
  text: string;
  languageCode?: string;
};

export type SarvamSpeechResult = {
  /** Base64-encoded WAV audio, ready to play in the browser. */
  audioBase64: string;
  mimeType: string;
  languageCode: string;
};

/**
 * Closes the voice loop: turns the read-back text into spoken audio via Sarvam's
 * Indic TTS. Kept server-side so the API key never reaches the browser; the
 * frontend plays the returned base64 and falls back to browser speech if TTS is
 * not configured.
 */
@Injectable()
export class SarvamTtsClient {
  async synthesize(input: SarvamSpeechInput): Promise<SarvamSpeechResult> {
    if (!env.SARVAM_API_KEY) {
      throw new AppError("Sarvam API key is not configured", 503);
    }
    const languageCode = input.languageCode ?? env.SARVAM_TTS_LANGUAGE_CODE;

    const response = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "api-subscription-key": env.SARVAM_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: input.text,
        target_language_code: languageCode,
        speaker: env.SARVAM_TTS_SPEAKER,
        model: env.SARVAM_TTS_MODEL
      })
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new AppError(`Sarvam text-to-speech failed: ${JSON.stringify(body)}`, response.status);
    }

    const audioBase64 = Array.isArray(body.audios) ? body.audios[0] : undefined;
    if (typeof audioBase64 !== "string" || !audioBase64) {
      throw new AppError("Sarvam text-to-speech returned no audio", 502);
    }

    return { audioBase64, mimeType: "audio/wav", languageCode };
  }
}
