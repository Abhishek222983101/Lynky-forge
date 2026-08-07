# Voice-first pipeline

Sornam turns one voice command into a validated, confirmed backend action. The
pipeline replaced the old sale-only intent parser with a **catalog-driven
tool-calling router**, so any action in the catalog is reachable by voice — not
just sales.

## The stages

```
 audio ──▶ STT ──▶ ROUTER ──▶ RESOLVER ──▶ PREVIEW ──▶ POLICY ──┬─▶ CONFIRM GATE ──▶ COMMAND BUS ──▶ DB (txn)
 (or text)         pick one    names→IDs    validate    write?   │      "yes"            execute
                   action +                 + read-back          └─▶ EXECUTE NOW  ──────▶ COMMAND BUS  (reads)
                   natural args
                        │
                        └─ unknown / missing slot / ambiguous name ──▶ CLARIFY (ask, then re-route the reply)
```

| Stage | File | Responsibility |
|---|---|---|
| STT | `integrations/sarvam/sarvam-stt.client.ts` | Sarvam Saaras v3 — transcribes Tamil/Telugu/Kannada/Hindi/English, incl. code-mixing. Text commands skip this. |
| Router | `voice/router/*` | Picks **one** action from the catalog and fills natural arguments. Deterministic offline / Sarvam LLM in prod. |
| Resolver | `voice/voice-resolver.service.ts` | Turns names & document numbers into UUIDs (customer, repair, scheme, invoice). Asks a question if ambiguous/missing. |
| Preview | `voice/voice-preview.service.ts` | Validates the resolved args against the execution Zod schema (generalized slot-filling) and builds the spoken read-back. Enriches sales with the live gold rate + GST totals. |
| Policy | `voice/voice-policy.service.ts` | Per-action `requiresConfirmation` + `sensitiveFields`. |
| Confirm/execute | `voice/voice.service.ts` | Owns session state + the confirm/clarify loop. Writes go through the confirm gate; reads execute immediately. |
| Command bus | `voice/voice-command-bus.service.ts` | Generic dispatcher: re-parses args with the action schema and calls the owning module's service inside a transaction. |

The single source of truth is the **catalog** in `voice/voice-actions.ts`: each
action carries its execution schema, `requiresConfirmation`, `sensitiveFields`,
an `argumentGuide` (fed to the LLM prompt) and `resolves` (which entities the
resolver must look up). The router prompt, the resolver, the policy and the bus
all read from it — so adding an action is a catalog + bus edit, not new NLU code.

## Worked example — "Lakshmi's repair is ready" (a write)

1. **STT** → `"Mark the repair for Lakshmi as ready"`.
2. **Router** → `{ action: "update_repair_status", arguments: { customerName: "Lakshmi", status: "ready" } }`.
3. **Resolver** → looks up the customer named Lakshmi → finds her latest **open**
   repair order → injects `repairOrderId`. (Two Lakshmis → *"More than one
   customer matches Lakshmi: … Which one?"* and the turn waits.)
4. **Preview** → `updateRepairStatus` schema validates; read-back =
   *"Update the repair for Lakshmi to ready. Should I save?"*.
5. **Policy** → this action requires confirmation → session goes
   `awaiting_confirmation`, a `VoiceToolInvocation` is stored (nothing written yet).
6. **Confirm** → staff says *"yes"* → command bus calls
   `RepairsService.updateStatus(...)` in a transaction; audit-logged; customer
   gets their WhatsApp update via the existing repair flow.

A **read** ("how much did we sell today?") skips the confirm gate: policy says no
confirmation, so it executes immediately and the answer is spoken back.

## The clarify / slot-filling loop

Any stage can bounce the turn to `awaiting_clarification` with a spoken question:
router `unknown`, a missing required slot, or an ambiguous/absent entity. The
next `POST /voice/sessions/:id/reply` **appends** the answer and re-routes the
full conversation — so *"record a repair for Ramesh"* → *"what item?"* →
*"gold bangle"* converges without special-casing per field.

## HTTP surface (`voice/sessions`)

- `POST /voice/sessions` — text transcript in.
- `POST /voice/sessions/audio` — audio file in (STT then identical flow).
- `POST /voice/sessions/:id/confirm` — `"yes"` / `"cancel"` at the gate.
- `POST /voice/sessions/:id/reply` — answer a clarification (slot filling).
- `GET  /voice/sessions/actions` — the live catalog.

## Configuration

`VOICE_INTENT_PROVIDER=deterministic` (default) runs fully offline with rule-based
routing — used in CI and when no Sarvam key is present. `=sarvam` swaps in
`LlmVoiceRouter`, which gives the model the full catalog and gets back a
schema-constrained action selection. Nothing else in the pipeline changes.

## Design notes

- **Confirm-before-write is kept and generalized.** Voice has far higher error
  rates than text; every mutating action reads its resolved values back first.
- **The catalog stays curated (< ~30 tools)** so a single LLM selection call
  keeps accuracy high. If it grows past that, add a domain router in front
  (classify → expose only that module's tools) before the LLM call.
- **Cascaded, not speech-to-speech**, because Indic-language coverage lives in
  Sarvam STT/LLM; end-to-end speech models don't handle Tamil/Telugu well.

## Not yet closed (frontend)

The backend loop is complete and reachable today via text or the `/audio`
endpoint. Two UI pieces remain to make it feel voice-first end to end:
mic capture posting to `/voice/sessions/audio`, and TTS playback of the
`confirmationMessage` (Sarvam has TTS) so the read-back is spoken, not just shown.
