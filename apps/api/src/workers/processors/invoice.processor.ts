import { Job, Worker } from "bullmq";
import { PrismaClient, EInvoiceStatus } from "@prisma/client";
import { workerConnection } from "@/workers/queues/queue";

const prisma = new PrismaClient();

export function startInvoiceProcessor() {
  return new Worker("invoice", async (job: Job<{ invoiceId: string }>) => {
    const invoice = await prisma.invoice.findUnique({ where: { id: job.data.invoiceId } });
    if (!invoice) return { status: "failed", reason: "invoice_not_found" };
    await prisma.invoice.update({ where: { id: invoice.id }, data: { eInvoiceStatus: EInvoiceStatus.pending_generation } });
    return { status: "pending_generation", invoiceId: invoice.id };
  }, { connection: workerConnection });
}
