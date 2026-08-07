import { DeterministicContentOrchestrator } from "./deterministic-orchestrator";
import { runQualityCheck } from "./quality-check";
import { GeneratedAsset } from "./types";

const orchestrator = new DeterministicContentOrchestrator();

describe("runQualityCheck (Section 19)", () => {
  it("passes a clean 9:16 reel with disclosure applied", async () => {
    const compiled = await orchestrator.compile({ text: "bridal reel", productImages: [{ url: "https://x/p.jpg" }] });
    const asset: GeneratedAsset = {
      kind: "reel",
      url: "https://x/r.mp4",
      aspectRatio: "9:16",
      meta: {},
      fidelityConfirmed: true,
      disclosureApplied: true,
    };
    expect(runQualityCheck(asset, compiled).passed).toBe(true);
  });

  it("flags a reel that is not 9:16", async () => {
    const compiled = await orchestrator.compile({ text: "bridal reel" });
    const asset: GeneratedAsset = {
      kind: "reel",
      url: "https://x/r.mp4",
      aspectRatio: "4:5",
      meta: {},
      fidelityConfirmed: false,
      disclosureApplied: true,
    };
    expect(runQualityCheck(asset, compiled).issues).toContain("reel aspect ratio is not 9:16");
  });

  it("flags a missing disclosure overlay", async () => {
    const compiled = await orchestrator.compile({ text: "festival post" });
    const asset: GeneratedAsset = {
      kind: "image",
      url: "https://x/a.png",
      aspectRatio: "4:5",
      meta: {},
      fidelityConfirmed: false,
      disclosureApplied: false,
    };
    expect(runQualityCheck(asset, compiled).issues).toContain("AI-disclosure overlay not applied");
  });
});
