import { Body, Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { audioVoiceSessionSchema, AudioVoiceSessionDto, confirmVoiceSessionSchema, ConfirmVoiceSessionDto, createVoiceSessionSchema, CreateVoiceSessionDto, replyVoiceSessionSchema, ReplyVoiceSessionDto, speakVoiceSchema, SpeakVoiceDto } from "./voice.schemas";
import { VoiceService } from "./voice.service";

@Controller("voice/sessions")
@UseGuards(JwtAuthGuard)
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Get("actions")
  actions() {
    return this.voice.listActions();
  }

  @Post("tts")
  tts(@Body(new ZodValidationPipe(speakVoiceSchema)) body: SpeakVoiceDto) {
    return this.voice.synthesizeSpeech(body.text, body.languageCode);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createVoiceSessionSchema)) body: CreateVoiceSessionDto, @CurrentUser() user: AuthUser) {
    return this.voice.createSession(body, user);
  }

  @Post("audio")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  createFromAudio(@UploadedFile() file: any, @Body(new ZodValidationPipe(audioVoiceSessionSchema)) body: AudioVoiceSessionDto, @CurrentUser() user: AuthUser) {
    return this.voice.createSessionFromAudio(file, body.source, user, body.languageCode);
  }

  @Post(":sessionId/confirm")
  confirm(@Param("sessionId") sessionId: string, @Body(new ZodValidationPipe(confirmVoiceSessionSchema)) body: ConfirmVoiceSessionDto, @CurrentUser() user: AuthUser) {
    return this.voice.confirm(sessionId, body.confirmation, user);
  }

  @Post(":sessionId/reply")
  reply(@Param("sessionId") sessionId: string, @Body(new ZodValidationPipe(replyVoiceSessionSchema)) body: ReplyVoiceSessionDto, @CurrentUser() user: AuthUser) {
    return this.voice.reply(sessionId, body.reply, user);
  }
}
