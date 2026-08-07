import { Job, Worker } from "bullmq";
import { workerConnection } from "@/workers/queues/queue";

export function startVoiceProcessor() {
  return new Worker("voice", async (job: Job<{ voiceSessionId: string }>) => {
    return { status: "not_scheduled", voiceSessionId: job.data.voiceSessionId };
  }, { connection: workerConnection });
}
