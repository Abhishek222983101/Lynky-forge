import { DisclosureService } from "./disclosure";
import { GeneratedAsset } from "./types";

describe("DisclosureService (Section 17)", () => {
  const service = new DisclosureService();
  const base: GeneratedAsset = {
    kind: "image",
    url: "https://x/a.png",
    aspectRatio: "4:5",
    meta: {},
    fidelityConfirmed: true,
    disclosureApplied: false,
  };

  it("records AI provenance in metadata without burning a visible watermark", async () => {
    const out = await service.apply(base);
    expect((out.meta as Record<string, unknown>).aiGenerated).toBe(true);
    expect((out.meta as Record<string, unknown>).disclosureMode).toBe("metadata-only");
  });

  it("leaves the image bytes untouched (no pixel overlay)", async () => {
    const sharp = (await import("sharp")).default;
    const input = await sharp({ create: { width: 240, height: 300, channels: 3, background: { r: 12, g: 12, b: 14 } } })
      .png()
      .toBuffer();
    const out = await service.apply({ ...base, url: undefined, buffer: input });
    expect(out.buffer).toBe(input);
  });

  it("applies to reels the same way (metadata only)", async () => {
    const out = await service.apply({ ...base, kind: "reel", aspectRatio: "9:16" });
    expect((out.meta as Record<string, unknown>).disclosureMode).toBe("metadata-only");
  });
});
