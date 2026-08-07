import { Injectable } from "@nestjs/common";
import { VoiceActionName, voiceActionMetadata } from "./voice-actions";

@Injectable()
export class VoicePolicyService {
  requiresConfirmation(actionName: VoiceActionName) {
    return voiceActionMetadata[actionName].requiresConfirmation;
  }

  sensitiveFields(actionName: VoiceActionName) {
    return voiceActionMetadata[actionName].sensitiveFields;
  }
}
