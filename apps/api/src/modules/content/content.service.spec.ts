import { ContentRequestStatus } from "@prisma/client";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { EventsService } from "@/modules/integrations/events/events.service";
import { ContentService } from "./content.service";

describe("ContentService", () => {
  it("creates a durable content request and emits an integration event", async () => {
    const db = {
      inventoryItem: { findFirst: jest.fn().mockResolvedValue({ id: "item-1", shopId: "shop-1" }) },
      contentRequest: {
        create: jest.fn().mockResolvedValue({
          id: "request-1",
          shopId: "shop-1",
          inventoryItemId: "item-1",
          occasion: "Diwali",
          status: ContentRequestStatus.requested
        })
      },
      internalEvent: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) }
    } as any;
    const service = new ContentService({} as any, new AuditLogsService({} as any), new EventsService(), { generate: jest.fn() } as any);

    const request = await service.createRequestTx(db, "shop-1", "user-1", { inventoryItemId: "item-1", occasion: "Diwali", prompt: "Promote chain" }, "test");

    expect(request.id).toBe("request-1");
    expect(db.contentRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shopId: "shop-1",
        inventoryItemId: "item-1",
        requestedBy: "user-1",
        status: ContentRequestStatus.requested
      })
    });
    expect(db.internalEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ shopId: "shop-1", eventName: "content.requested" })
    });
  });
});
