import { startContentProcessor } from "./processors/content.processor";
import { startInvoiceProcessor } from "./processors/invoice.processor";
import { startVoiceProcessor } from "./processors/voice.processor";

startInvoiceProcessor();
startVoiceProcessor();
startContentProcessor();
