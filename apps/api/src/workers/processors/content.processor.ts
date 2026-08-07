// M4 Content Studio worker: completes long-running reels (real Veo 3). Polls the
// operation and, when ready, updates the ContentAsset url + status. Only relevant
// when CONTENT_VIDEO_PROVIDER=veo3; the stub path returns ready reels directly.

import { Job, Worker } from "bullmq";
import { Prisma, PrismaClient } from "@prisma/client";
import { env } from "../../common/config/env";
import { Veo3VideoProvider } from "../../modules/content/studio/providers/veo3-video.provider";
import { workerConnection } from "../queues/queue";

const prisma = new PrismaClient();

type ReelPollJob = { contentAssetId: string; operation: string };

export function startContentProcessor() {
  const provider = new Veo3VideoProvider();
  return new Worker(
    "content",
    async (job: Job<ReelPollJob>) => {
      if (env.CONTENT_VIDEO_PROVIDER !== "veo3") return { status: "skipped" };
      const result = provider.pollReel ? await provider.pollReel(job.data.operation) : null;
      if (!result?.url) {
        // Not ready yet - throw so BullMQ retries with backoff.
        throw new Error("reel not ready");
      }
      const asset = await prisma.contentAsset.findUnique({ where: { id: job.data.contentAssetId } });
      const metadata = { ...((asset?.metadata as Record<string, unknown>) ?? {}), status: "ready", provider: "veo3" };
      await prisma.contentAsset.update({
        where: { id: job.data.contentAssetId },
        data: { url: result.url, metadata: metadata as Prisma.InputJsonValue },
      });
      return { status: "ready", url: result.url };
    },
    { connection: workerConnection },
  );
}
