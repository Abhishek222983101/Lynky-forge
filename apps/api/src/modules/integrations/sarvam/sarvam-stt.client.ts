import { Injectable } from "@nestjs/common";
import { env } from "@/common/config/env";
import { AppError } from "@/common/errors/app-error";

export type SarvamTranscriptionInput = {
  audio: Buffer;
  filename: string;
  mimeType: string;
  languageCode?: string;
};

export type SarvamTranscriptionResult = {
  transcript: string;
  languageCode?: string;
  languageProbability?: number;
  requestId?: string;
  raw: unknown;
};

@Injectable()
export class SarvamSttClient {
  async transcribe(input: SarvamTranscriptionInput): Promise<SarvamTranscriptionResult> {
    if (!env.SARVAM_API_KEY) {
      throw new AppError("Sarvam API key is not configured", 503);
    }

    const form = new FormData();
    const audioPart = input.audio.buffer.slice(input.audio.byteOffset, input.audio.byteOffset + input.audio.byteLength) as ArrayBuffer;
    form.append("file", new Blob([audioPart], { type: input.mimeType }), input.filename);
    form.append("model", env.SARVAM_STT_MODEL);
    form.append("mode", env.SARVAM_STT_MODE);
    form.append("language_code", input.languageCode ?? env.SARVAM_STT_LANGUAGE_CODE);

    const response = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: { "api-subscription-key": env.SARVAM_API_KEY },
      body: form
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new AppError(`Sarvam speech-to-text failed: ${JSON.stringify(body)}`, response.status);
    }

    const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
    if (!transcript) {
      throw new AppError("Sarvam speech-to-text returned an empty transcript", 422);
    }

    return {
      transcript,
      languageCode: typeof body.language_code === "string" ? body.language_code : undefined,
      languageProbability: typeof body.language_probability === "number" ? body.language_probability : undefined,
      requestId: typeof body.request_id === "string" ? body.request_id : undefined,
      raw: body
    };
  }
}
