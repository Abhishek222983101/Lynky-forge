import { ContentStudioService } from "./content-studio.service";
import { DeterministicContentOrchestrator } from "./deterministic-orchestrator";
import { DisclosureService } from "./disclosure";
import { StubImageProvider } from "./providers/image-provider";
import { StubVideoProvider } from "./providers/video-provider";

function makeService(): ContentStudioService {
  return new ContentStudioService(
    new DeterministicContentOrchestrator(),
    new StubImageProvider(),
    new StubVideoProvider(),
    new DisclosureService(),
  );
}

describe("ContentStudioService.generate (stub providers)", () => {
  it("produces a single still for an image request", async () => {
    const assets = await makeService().generate({ text: "festival post photo", category: "temple" });
    expect(assets).toHaveLength(1);
    expect(assets[0].kind).toBe("image");
    expect(assets[0].url).toBeDefined();
    // AI provenance is recorded in metadata; no visible watermark is burned in.
    expect((assets[0].meta as Record<string, unknown>).aiGenerated).toBe(true);
    expect((assets[0].meta as Record<string, unknown>).disclosureMode).toBe("metadata-only");
  });

  it("produces a 9:16 reel for a reel request", async () => {
    const assets = await makeService().generate({ text: "make a reel" });
    expect(assets).toHaveLength(1);
    expect(assets[0].kind).toBe("reel");
    expect(assets[0].aspectRatio).toBe("9:16");
  });

  it("produces both an image and a reel for 'both'", async () => {
    const assets = await makeService().generate({ text: "image and reel please" });
    expect(assets.map((a) => a.kind).sort()).toEqual(["image", "reel"]);
    const reel = assets.find((a) => a.kind === "reel");
    expect(reel?.aspectRatio).toBe("9:16");
  });

  it("produces three linked stills for a carousel", async () => {
    const assets = await makeService().generate({ text: "carousel set of posts" });
    expect(assets).toHaveLength(3);
    expect(assets.every((a) => a.kind === "image")).toBe(true);
  });

  it("marks fidelityConfirmed when a product image is attached", async () => {
    const assets = await makeService().generate({ text: "reel", productImages: [{ url: "https://x/p.jpg" }] });
    expect(assets[0].fidelityConfirmed).toBe(true);
  });
});
