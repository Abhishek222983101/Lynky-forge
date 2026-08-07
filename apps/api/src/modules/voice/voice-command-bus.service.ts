import { Injectable } from "@nestjs/common";
import { AccountingService } from "@/modules/accounting/accounting.service";
import { InvoicePdfService } from "@/modules/billing/invoice-pdf.service";
import { BuybackService } from "@/modules/buyback/buyback.service";
import { ContentService } from "@/modules/content/content.service";
import { SocialService } from "@/modules/content/social/social.service";
import { CustomersService } from "@/modules/customers/customers.service";
import { InventoryService } from "@/modules/inventory/inventory.service";
import { KarigarService } from "@/modules/karigar/karigar.service";
import { OwnerCockpitService } from "@/modules/owner-cockpit/owner-cockpit.service";
import { RepairsService } from "@/modules/repairs/repairs.service";
import { SalesService } from "@/modules/sales/sales.service";
import { SchemesService } from "@/modules/schemes/schemes.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { VoiceActionName, voiceActionSchemas } from "./voice-actions";
import { VoiceLookupService } from "./voice-lookup.service";

@Injectable()
export class VoiceCommandBusService {
  constructor(
    private readonly accounting: AccountingService,
    private readonly buyback: BuybackService,
    private readonly content: ContentService,
    private readonly social: SocialService,
    private readonly customers: CustomersService,
    private readonly inventory: InventoryService,
    private readonly invoicePdf: InvoicePdfService,
    private readonly karigars: KarigarService,
    private readonly ownerCockpit: OwnerCockpitService,
    private readonly repairs: RepairsService,
    private readonly sales: SalesService,
    private readonly schemes: SchemesService,
    private readonly lookup: VoiceLookupService
  ) {}

  async execute(actionName: VoiceActionName, input: unknown, actor: AuthUser) {
    const parsed: any = voiceActionSchemas[actionName].parse(input);
    if (!actor.shopId) throw new AppError("Shop context required", 400);

    switch (actionName) {
      case "lookup":
        return this.lookup.run(parsed.entity, actor.shopId, parsed.search, parsed.limit);
      case "record_sale_draft":
        return this.sales.createVoiceConfirmed(parsed, actor);
      case "ask_owner_cockpit":
        return this.ownerCockpit.query(parsed, actor);
      case "stock_summary":
        return this.inventory.summary(actor);
      case "slow_stock_report":
        return this.inventory.slowStock(actor, parsed);
      case "promote_slow_stock":
        return this.content.promoteSlowStock(actor, parsed);
      case "issue_karigar_job":
        return this.karigars.issueJob(actor, parsed);
      case "record_karigar_return": {
        const { jobId, ...body } = parsed;
        return this.karigars.recordReturn(actor, jobId, body);
      }
      case "karigar_scorecard":
        return this.karigars.scorecard(actor, parsed.karigarId);
      case "create_inventory_item":
        return this.inventory.createItem(actor, parsed);
      case "record_stock_movement":
        return this.inventory.recordMovement(actor, parsed);
      case "create_content_request":
        return this.content.createRequest(actor, parsed);
      case "generate_content_post": {
        const text = parsed.text
          || (parsed.occasion ? `Create an elegant ${parsed.occasion} post for this jewellery item.` : "Create an elegant product post for this jewellery item.");
        return this.content.generateStudioAssets(actor, {
          text,
          occasion: parsed.occasion ?? undefined,
          category: parsed.category ?? undefined,
          inventoryItemId: parsed.inventoryItemId ?? undefined,
          requestedType: "image",
          language: "en",
        } as any);
      }
      case "approve_content_post":
        return this.content.reviewLatestAsset(actor, "approved");
      case "publish_content_post":
        return this.social.publishLatest(actor, parsed.platforms, parsed.scheduledAt);
      case "buyback_summary":
        return this.buyback.summary(actor);
      case "create_buyback_bundle":
        return this.buyback.createBundle(actor, parsed);
      case "assign_buyback_items": {
        const { bundleId, ...body } = parsed;
        return this.buyback.assignItems(actor, bundleId, body);
      }
      case "update_inventory_status": {
        const { inventoryItemId, ...body } = parsed;
        return this.inventory.updateStatus(actor, inventoryItemId, body);
      }
      case "create_karigar":
        return this.karigars.create(actor, parsed);
      case "create_customer":
        return this.customers.create(actor, parsed);
      case "create_repair_order":
        return this.repairs.create(actor, parsed);
      case "update_repair_status": {
        const { repairOrderId, ...body } = parsed;
        return this.repairs.updateStatus(actor, repairOrderId, body);
      }
      case "create_scheme":
        return this.schemes.create(actor, parsed);
      case "record_scheme_installment": {
        const { schemeId, ...body } = parsed;
        return this.schemes.recordInstallment(actor, schemeId, body);
      }
      case "create_buyback_item":
        return this.buyback.recordItem(actor, parsed);
      case "generate_invoice_pdf":
        return this.invoicePdf.generate(parsed.invoiceId, actor.shopId);
      case "export_accounting_file":
        return this.accounting.createExport(actor, parsed);
      default:
        throw new AppError(`Unsupported voice action: ${actionName}`, 422);
    }
  }
}
