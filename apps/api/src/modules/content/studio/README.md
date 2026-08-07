# M4 Content Studio (generation engine)

Generates premium jewellery marketing content (stills + 9:16 reels) from a
shop-owner request, governed by `../prompts/system-prompt.md`. Lives inside the
existing `content` module and follows the repo's NestJS + zod + env conventions.

## Flow
```
ContentRequest
  -> Orchestrator.compile()   (Section 0 routing -> validated CompiledPrompt; reels forced 9:16)
  -> ImageProvider.generateStill()   (still, and the hero still for a reel)
  -> VideoProvider.generateReel()    (9:16, <=8s, from the hero still)
  -> DisclosureService.apply()       (Section 17 overlay, applied downstream)
  -> runQualityCheck()               (Section 19 machine-checkable gate)
  -> GeneratedAsset[]
```

## Route
`POST /content/studio/generate` (JWT-guarded, owner/admin). Body = `ContentGenerateDto`
(text, optional productImages, requestedType, occasion, category, platform, language).
It generates assets, **persists them to the gallery** as `ContentAsset` rows (with
`aiLabel` + caption), marks the `ContentRequest` ready, emits `content.asset_ready`,
and returns `{ request, assets }`. Real image bytes are stored via
`content-storage.ts` (data URL by default; swap for S3/R2/MinIO for scale).

## Providers (swappable, config-driven)
| Concern | Interface | Default (no key) | Real impl |
|---|---|---|---|
| Orchestrator | `ContentOrchestrator` | `DeterministicContentOrchestrator` | `LlmContentOrchestrator` (Sarvam) |
| Image | `ImageProvider` | `StubImageProvider` | `GeminiImageProvider` (Nano Banana / Gemini 2.5 Flash Image) |
| Reel | `VideoProvider` | `StubVideoProvider` | `Veo3VideoProvider` |

Swap via env; no keys required for the defaults (stubs return placeholder assets).

## Env vars
```
CONTENT_ORCHESTRATOR_PROVIDER = deterministic | sarvam   (default deterministic)
CONTENT_IMAGE_PROVIDER        = stub | gemini            (default stub)
CONTENT_VIDEO_PROVIDER        = stub | veo3              (default stub)
GEMINI_API_KEY, GEMINI_IMAGE_MODEL
VEO_API_KEY, VEO_MODEL
SARVAM_API_KEY, SARVAM_CHAT_MODEL   (reused from the voice module)
CONTENT_ASSET_BASE_URL              (base for stub asset URLs)
```

## Hard rules enforced in code (not just prompt)
- Reels are ALWAYS 9:16 (`enforceContract` + provider assertion).
- Positive prompt never contains text/label/brand words; negative always does.
- With-product mode preserves the attached piece exactly; text-only makes a faithful
  representative piece and never claims a specific real design.
- Disclosure ("AI-generated") is applied downstream, never drawn by the model.

## Disclosure
`sharp` composites the fixed "AI-generated" overlay onto real image pixels
(`DisclosureService.stampPixels`). Stub/URL-only assets and reels record the
overlay spec for the media pipeline to stamp.

## Reels (async)
The stub returns a ready reel immediately. Real Veo 3 returns a long-running
operation, so the reel asset is persisted as `processing` and the `content`
BullMQ worker (`workers/processors/content.processor.ts`) polls it to `ready`.

## Going live (only add keys)
Set `CONTENT_IMAGE_PROVIDER=gemini` + `GEMINI_API_KEY`, `CONTENT_VIDEO_PROVIDER=veo3`
+ `VEO_API_KEY` (and optionally `CONTENT_ORCHESTRATOR_PROVIDER=sarvam`). No code
change. The generated media's visual quality should be reviewed by a human once
(inherent to generative AI).
