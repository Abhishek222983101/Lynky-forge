ALTER TYPE "VoiceStatus" ADD VALUE IF NOT EXISTS 'awaiting_clarification';
ALTER TYPE "VoiceStatus" ADD VALUE IF NOT EXISTS 'executed';

CREATE TYPE "VoiceToolInvocationStatus" AS ENUM (
  'proposed',
  'awaiting_confirmation',
  'confirmed',
  'executed',
  'cancelled',
  'failed'
);

CREATE TABLE "voice_tool_invocations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "voice_session_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "action_name" TEXT NOT NULL,
  "status" "VoiceToolInvocationStatus" NOT NULL DEFAULT 'proposed',
  "input" JSONB NOT NULL,
  "output" JSONB,
  "error_message" TEXT,
  "requires_confirmation" BOOLEAN NOT NULL DEFAULT false,
  "confirmation_message" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "executed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_tool_invocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "voice_tool_invocations_shop_id_idx" ON "voice_tool_invocations"("shop_id");
CREATE INDEX "voice_tool_invocations_voice_session_id_idx" ON "voice_tool_invocations"("voice_session_id");
CREATE INDEX "voice_tool_invocations_shop_id_action_name_idx" ON "voice_tool_invocations"("shop_id", "action_name");
CREATE INDEX "voice_tool_invocations_shop_id_status_idx" ON "voice_tool_invocations"("shop_id", "status");

ALTER TABLE "voice_tool_invocations"
  ADD CONSTRAINT "voice_tool_invocations_voice_session_id_fkey"
  FOREIGN KEY ("voice_session_id") REFERENCES "voice_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
