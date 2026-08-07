import { DeterministicContentOrchestrator } from "./deterministic-orchestrator";
import { ContentRequest } from "./types";

const orchestrator = new DeterministicContentOrchestrator();

function req(partial: Partial<ContentRequest> & { text: string }): ContentRequest {
  return { ...partial };
}

describe("DeterministicContentOrchestrator (Section 0 routing)", () => {
  it("routes reel keywords to a reel and forces 9:16", async () => {
    const cp = await orchestrator.compile(req({ text: "make a reel for this necklace" }));
    expect(cp.outputType).toBe("reel");
    expect(cp.aspectRatio).toBe("9:16");
  });

  it("routes image keywords to a 4:5 still", async () => {
    const cp = await orchestrator.compile(req({ text: "create a festival post photo" }));
    expect(cp.outputType).toBe("image");
    expect(cp.aspectRatio).toBe("4:5");
  });

  it("routes 'image and reel' to both", async () => {
    const cp = await orchestrator.compile(req({ text: "give me an image and reel" }));
    expect(cp.outputType).toBe("both");
  });

  it("defaults an ambiguous request to a single 4:5 image", async () => {
    const cp = await orchestrator.compile(req({ text: "something nice for my temple necklace" }));
    expect(cp.outputType).toBe("image");
    expect(cp.aspectRatio).toBe("4:5");
  });

  it("detects with-product mode when a product image is attached", async () => {
    const cp = await orchestrator.compile(req({ text: "reel", productImages: [{ url: "https://x/p.jpg" }] }));
    expect(cp.attachmentMode).toBe("with-product");
    expect(cp.positive).toContain("preserved unchanged");
  });

  it("uses text-only mode when no product image is attached", async () => {
    const cp = await orchestrator.compile(req({ text: "diamond studs image" }));
    expect(cp.attachmentMode).toBe("text-only");
    expect(cp.positive.toLowerCase()).toContain("representative");
  });

  it("always includes text/label/brand terms in the negative prompt", async () => {
    const cp = await orchestrator.compile(req({ text: "bridal reel" }));
    const n = cp.negative.toLowerCase();
    expect(n).toContain("text");
    expect(n).toContain("label");
    expect(n).toContain("brand name");
  });

  it("never includes text/label/brand words in the positive prompt", async () => {
    const cp = await orchestrator.compile(req({ text: "festival post with logo and text label", category: "temple" }));
    expect(cp.positive.toLowerCase()).not.toMatch(/\b(watermark|logo|typography|subtitle|ai-generated)\b/);
  });

  it("forces reels to 9:16 even if a platform hints otherwise", async () => {
    const cp = await orchestrator.compile(req({ text: "youtube reel", platform: "YouTube" }));
    expect(cp.aspectRatio).toBe("9:16");
  });
});
