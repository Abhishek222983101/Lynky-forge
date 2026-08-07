import { InventoryStatus, StockMovementType } from "@prisma/client";
import { InventoryService } from "./inventory.service";

describe("InventoryService", () => {
  it("marks linked inventory sold and writes a sale movement on confirmed sale", async () => {
    const tx = {
      inventoryItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: "item-1",
          shopId: "shop-1",
          name: "22K Chain",
          status: InventoryStatus.available,
          netWeight: "18.500",
          grossWeight: "18.500"
        }),
        update: jest.fn().mockResolvedValue({})
      },
      stockMovement: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "movement-1", ...data }))
      }
    } as any;
    const service = new InventoryService({} as any, {} as any);

    await service.applySaleConfirmed(tx, "shop-1", "user-1", "sale-1", [{ inventoryItemId: "item-1", netWeight: "18.5" }]);

    expect(tx.inventoryItem.update).toHaveBeenCalledWith({ where: { id: "item-1" }, data: { status: InventoryStatus.sold } });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shopId: "shop-1",
        inventoryItemId: "item-1",
        movementType: StockMovementType.sale,
        referenceType: "sale",
        referenceId: "sale-1",
        toStatus: InventoryStatus.sold
      })
    });
  });

  it("rejects sale deduction when linked inventory is already sold", async () => {
    const tx = {
      inventoryItem: {
        findFirst: jest.fn().mockResolvedValue({ id: "item-1", name: "Sold chain", status: InventoryStatus.sold }),
        update: jest.fn()
      },
      stockMovement: { create: jest.fn() }
    } as any;
    const service = new InventoryService({} as any, {} as any);

    await expect(service.applySaleConfirmed(tx, "shop-1", "user-1", "sale-1", [{ inventoryItemId: "item-1" }])).rejects.toMatchObject({
      response: { detail: expect.stringContaining("not available") },
      status: 409
    });
    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
  });
});
