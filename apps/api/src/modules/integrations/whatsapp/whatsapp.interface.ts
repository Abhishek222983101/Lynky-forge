export interface WhatsAppInterface {
  queueInvoiceMessage(shopId: string, customerId: string, invoiceId: string): Promise<void>;
  queueCustomerMessage(shopId: string, customerId: string, templateName: string, payload: Record<string, unknown>): Promise<void>;
}

export class WhatsAppNotImplemented implements WhatsAppInterface {
  async queueInvoiceMessage(): Promise<void> {
    throw new Error("WhatsApp workflow integration is not configured");
  }
  async queueCustomerMessage(): Promise<void> {
    throw new Error("WhatsApp workflow integration is not configured");
  }
}
