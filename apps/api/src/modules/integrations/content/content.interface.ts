export interface ContentInterface {
  requestContentGeneration(shopId: string, inventoryItemId: string, occasion: string): Promise<void>;
}

export class ContentNotImplemented implements ContentInterface {
  async requestContentGeneration(): Promise<void> {
    throw new Error("Content generation integration is not configured");
  }
}
