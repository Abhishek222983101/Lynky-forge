import { VoiceSource } from "@prisma/client";
import { z } from "zod";

export const createVoiceSessionSchema = z.object({
  source: z.nativeEnum(VoiceSource),
  transcript: z.string().min(1)
});

export const audioVoiceSessionSchema = z.object({
  source: z.nativeEnum(VoiceSource).default(VoiceSource.app_speak),
  languageCode: z.string().optional()
});

export const confirmVoiceSessionSchema = z.object({
  confirmation: z.string().min(1)
});

export const replyVoiceSessionSchema = z.object({
  reply: z.string().min(1)
});

export const speakVoiceSchema = z.object({
  text: z.string().min(1),
  languageCode: z.string().optional()
});

export type CreateVoiceSessionDto = z.infer<typeof createVoiceSessionSchema>;
export type AudioVoiceSessionDto = z.infer<typeof audioVoiceSessionSchema>;
export type ConfirmVoiceSessionDto = z.infer<typeof confirmVoiceSessionSchema>;
export type ReplyVoiceSessionDto = z.infer<typeof replyVoiceSessionSchema>;
export type SpeakVoiceDto = z.infer<typeof speakVoiceSchema>;
