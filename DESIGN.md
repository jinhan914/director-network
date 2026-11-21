# Director Network — design

## Starting state (what existed before the submission period)

The SLAY HACKS entry "Director — AI Animation Director" (submitted 2026-11-21,
Devpost ID 1313839, repo `jinhan914/ai-animation-director`): a single-file web
app. Paste a script → split into scenes → keyword classifier picks one of five
animation libraries per scene (Anime.js kinetic type, Motion Canvas diagram,
Manim formula, Three.js spatial, Proton particles) with a reason and rejected
alternatives → generated code panel → Canvas 2D preview player with pacing
(Calm 130 / Standard 150 / Punchy 185 wpm) → storyboard JSON export.
Classifier verified 12/12, Doubao round 3 approved, demo video 2:28.

## What is new in this project (built after 2026-11-11)

1. The casting decision is no longer hard-coded page logic: it is a **published,
   portable agent network** (`director.network.json`) in the Neuro SAN data
   model, JSON form, fully resolved (no includes, no env substitutions).
2. A **browser runtime** (`runtime/runtime.js`) that loads and runs that
   network, with validation, bounded execution, consent and BYOK.
3. A **peer network** (`critic.network.json`) loaded by URL after user
   consent, running in the caller's browser on the caller's key.
4. A **manifest** (`agent-manifest.json`) + **links map** (`links.json`) so
   other agentic sites can discover and call the director network.
5. A **model-settings interface** (BYOK) and an **activity log** showing
   router, origins contacted, tool calls and consent decisions.

## Agent graph (director network)

```
director (front agent)
 ├─ caster ──► website_cast_scene (site action, deterministic)
 ├─ kinetic_writer ──► website_render_scene (kind=kinetic)
 ├─ diagram_writer ──► website_render_scene (kind=diagram)
 ├─ formula_writer ──► website_render_scene (kind=formula)
 ├─ spatial_writer ──► website_render_scene (kind=orbit)
 ├─ particle_writer ──► website_render_scene (kind=particles)
 ├─ exporter ──► website_export_storyboard
 └─ director ──► peer: critic (via links.json, only after consent)
```

Delegation rules: `director` splits the script into scenes and calls `caster`
once per scene. `caster` returns the library + reason; `director` then calls
the matching writer, which renders that scene through the site action. `exporter`
runs last and returns the storyboard JSON. The critic is called only if the
user ticks "Ask the critic peer to review" — the runtime shows a consent card
naming the peer origin and purpose before fetching anything.

## Site actions (grounded capabilities)

| Action | Effect | What it does |
|---|---|---|
| `website_cast_scene` | read | Runs the SLAY keyword classifier on one scene; returns library, reason, rejected alternatives, signals. No LLM call. |
| `website_render_scene` | write (local UI) | Draws the scene on the stage canvas in the chosen style; returns a receipt (scene id, kind, render time). |
| `website_export_storyboard` | read | Returns the full storyboard JSON (scenes, signals, reasons, code) as a downloadable file. |

All three are registered with the runtime with name, purpose, JSON Schema and
effect classification. The runtime validates arguments and shows the user the
destination and arguments before any write. No site action touches the network,
sends data off-origin, or spends money.

## Conformance map (MVP Profile 0.3)

| Spec requirement | How this project meets it |
|---|---|
| Manifest `agent-manifest.json` | Published at site root; networks `director` + `critic`, each with `front_man` (spec field; `front_agent` kept as an alias for this runtime) and `hocon` (`./<network>.network.json`, resolved JSON path); `llm_router` with `base_url` + `byok_router` as the user-configurable placeholder `https://YOUR_ROUTER_BASE_URL/v1` (no default router, no Otari — see "Round 3 fixes"); `deployment` = static / self-contained runtime / direct BYOK; `actions.version` = 1, `module` = `./site-actions.js` (no bridge — see below); `peer_policy: "consent"`; `allowed_peers` = same origin |
| Resolved network definition | `director.network.json` + `critic.network.json`, Neuro SAN data model, JSON form, no includes/env refs |
| Runtime in the browser | `runtime/runtime.js`: parse + validate (rejects malformed network, duplicate/missing agents, bad front agent), agent loop with streaming + tool calls + delegation, bounded history |
| Grounded capability | Site actions above; MCP is not used — the spec allows grounded capability via registered local site actions |
| Peer loading | `links.json` maps `critic` → critic network URL; runtime fetches peer manifest, exact-name match only, consent card before fetch, peer runs on caller's router/key, key never sent to peer |
| BYOK | Settings panel: router base URL, model, key; stored origin-scoped localStorage, deletable; key attached only to model requests; missing key → clear setup error; demo mode works with no key |
| Bounds | Max 30 tool calls, max 60 s, max depth 3 per request; over-budget → visible error, no silent partial success claimed |
| Fail closed | Invalid network / denied origin / over-budget / unknown write outcome → visible error, never reported as success |
| Private context | No `sly_data` is used. Nothing passes to the peer except the storyboard text the user explicitly approved in the consent card |
| Free testing | Demo mode (no key) runs the full flow; judges can test without paying |

## Deliberately out of scope (and why)

- **No MCP server.** The spec's baseline grounded capability can be a local
  site action; adding an MCP server would add a hosted dependency and no
  judging value for this product.
- **No Mozilla Otari.** BYOK already covers pluggable inference; Otari is one
  router option a visitor may enter, not a dependency.
- **No action bridge (`bridge/action-bridge.html`).** In the reference
  build the bridge is the page other agent sites load in a hidden frame to
  call this site's actions cross-site. This site's actions are page-local
  by design — they draw on this page's own canvas and export this page's
  own storyboard — and no other site needs to call them, so there is no
  shared read/write surface to publish. The cross-site feature this site
  does have is peer loading (the critic), which works through `links.json`
  + user consent instead. The manifest therefore declares
  `actions.version: 1` and `actions.module: ./site-actions.js` but no
  `actions.bridge`; claiming a bridge we do not implement would be worse
  than omitting it. If a future version shares an action cross-site, the
  bridge is the first thing to add, with `bridge-actions.js` allow-listing
  only the read actions.
- **No coded-tool bundle.** The network is data-only, which is the minimum
  portable profile and the safest for peer trust.
- **No server.** Static hosting (GitHub Pages) + CORS is all the spec needs;
  the site host pays for nothing, matching the spec's key principle.
- **DirectorID / BNB on-chain identity is an extension, not in the network.**
  The storyboard hash can be anchored on BNB Chain via the DirectorID contract
  (built for the BNB hackathon) as a signed authorship record, but the network
  does not depend on it and no wallet is required to use the site.

## Verification checklist (before submission)

- [x] `agent-manifest.json` parses; both networks resolve; front agents exist
- [x] `director.network.json` validates: no duplicate agent names, every
      `tools` reference resolves, instructions are data-only
- [x] Demo mode (no key): preset → scenes cast → stage renders → storyboard
      exports → critic peer loads after consent → verdict returns
- [ ] BYOK mode: test key against an OpenAI-compatible endpoint; key never
      appears in URLs, prompts, traces or peer requests
- [x] Peer denied: consent refused → peer never fetched, visible message
- [x] Over-budget: forced long run stops at 30 calls with a visible error
- [x] LLM mode delegation: director → caster → writer → exporter runs end
      to end with a stubbed model (see "Round 2 implementation" below);
      still needs a live BYOK test against a real router
- [ ] AgentCheck (https://agentcheck.netlify.app) run on the published URL;
      all 34 rules pass or are documented — **first run 2026-11-21: NOT
      CONFORMING YET, 7 passed / 2 MUST failed / 2 tips** (see "Round 3
      fixes" below). Must re-run after re-uploading the fixed files.
- [ ] Screenshots + David's on-camera video (<2 min, public YouTube)

## Round 3 fixes — real-browser test + AgentCheck (2026-11-21)

Real-browser test on the published Pages site (12:11–12:16 CST) and an
AgentCheck run found 5 gaps; all 5 are fixed below. Tests:
`tests/demo-flow.test.js` now **53/53 pass** (40 before + 13 new).

1. **UI hint (not a bug).** Single-paragraph scripts stay 1 scene — that is
   the documented SLAY behaviour (blank lines start a new scene). Splitting
   unchanged; `index.html` now says "Separate scenes with a blank line —
   one idea per scene." (test: hint text present).
2. **Rejected alternatives were not shown.** `site-actions.js` already
   returned `rejected` + `signals` per scene and the storyboard stored them,
   but `index.html` rendered only the reason. Now each scene shows
   "Rejected alternatives: …" and "Signals: …" under the reason. (tests:
   choices contain both after a run.)
3. **Storyboard export had no visible download.** Export auto-downloaded
   silently, so the JSON could not be re-downloaded or verified.
   `index.html` now has a visible "Download storyboard (.json)" button
   (disabled until a run finishes; re-downloads the last storyboard).
   Auto-download on export is kept. (tests: button disabled in markup,
   enabled after a run, click re-downloads the 5-scene JSON.)
4. **Critic gave 10/10 with zero fixes on weak input.** The demo-mode
   critic only flagged >40-word scenes and very short kinetic scenes, so a
   1-scene "Hello world" scored 10/10 and the "up to 3 fixes" display could
   never be verified. Now it also flags: a 1-scene storyboard, a scene under
   4 words, and a scene with no caster signal — each as a concrete fix, one
   point off per issue (floor 5/10). "Hello world" now scores **7/10 with 3
   fixes**; the 5-scene preset scores **9/10 with 1 fix** (scene 1 has no
   caster signal — honest, not faked). The same rules were added to
   `critic.network.json` instructions so the network definition matches the
   local review. (tests: weak-input verdict + preset fix displayed.)
5. **AgentCheck MUSTs (checked against MVP Profile 0.2, 6 Nov 2026, while
   the site claims 0.3).** The 0.3 spec document itself
   (`docs/worldwide_agentic_web_mvp_spec.md`, "MVP Profile 0.3 | 18 November
   2026") requires manifest networks to carry `name`, `front_man` and
   `hocon` — so `front_man` is the spec field in **both** 0.2 and 0.3, and
   adding it breaks nothing in 0.3. Fixes in `agent-manifest.json`:
   (a) each network entry now has `front_man` alongside the kept
   `front_agent` alias, and `hocon` normalised to `./<network>.network.json`
   (the template form); `runtime.js` `validateManifest` /
   `validateNetwork` / peer check / front-agent lookup accept either field,
   and the hocon comparison normalises the `./` prefix on both sides.
   (b) added `llm_router` with `base_url` + `byok_router` set to the
   clearly user-configurable placeholder `https://YOUR_ROUTER_BASE_URL/v1`
   (`mock: false`, `default: null`, with a note in the manifest): it is
   **not a real endpoint, never fetched, no Otari account** — demo mode
   needs no router at all and LLM mode takes the visitor's own router from
   the settings panel. (c) tips: added `deployment` =
   `{"mode":"static","self_contained_runtime":true,"direct_byok":true,
   "browser_mock":false}` and `actions.version: 1` +
   `actions.module: "./site-actions.js"` (no `actions.bridge` — see
   "Deliberately out of scope"). The spec repo was cloned to /tmp only to
   read the spec text; no reference runtime/bridge code was copied — the
   runtime remains self-written. (tests: 8 new manifest conformance checks,
   including front_man-only validation and the no-Otari-URL check.)

Still open after round 3: **AgentCheck re-run on the re-uploaded site**
(parent, browser); BYOK live test with a real key; screenshots; video.

## Round 2 implementation (Doubao round 2, steps 1–2, 2026-11-21)

Implemented the Doubao round 2 plan (chat 38455477846965506), steps 1–2,
in `runtime/runtime.js` only — no change to any `*.network.json`,
`site-actions.js` or `index.html`; limits unchanged (30 calls / 60 s /
depth 3).

**Step 1 — LLM agent-to-agent delegation.** The model loop used to expose
agent names as tools while `DirectorActions` only had the three `website_*`
actions, so any LLM call to `caster` failed closed with "Unknown tool".
Now `dispatchTool()` intercepts tool calls naming a network agent and runs
that agent as a sub-agent (`runSubAgent()`): the agent's instructions become
the system prompt, the tool-call arguments become the input, and its tools
are limited to its declared `tools` array (e.g. caster may only call
`website_cast_scene`). Sub-agents are never registered in
`window.DirectorActions`, cannot delegate further (second-level delegation
throws `permission_denied`), and have no peer access (peer loading stays in
the top-level director flow). The BYOK key is reused from the top-level
settings and is attached only by `callModel`, never passed to peers.
Success returns a JSON string `{"ok":true,"agent":"caster","payload":{...}}`
where payload is the sub-agent's last site-action result (or its parsed
final answer). Any sub-agent error propagates up, the run terminates, the UI
shows the error, and no partial storyboard is returned (fail closed).
Budget is one shared object: every delegation counts as one tool call and
every site action counts through the wrapper, so parent + sub-agents share
the 30-call / 60-second budget; exceeding either throws `budget_exceeded`
immediately. Delegation depth is +1 per layer; at depth 3 the run throws
`delegate_depth` ("Over budget: delegation depth exceeded 3"). Every
delegation is logged via `DirectorLog("delegate", "delegating to agent X")`.
`run()` in LLM mode now also returns `scenes` (from the exporter's
storyboard, default `[]`) so the page UI — which renders `board.scenes` —
cannot crash on an LLM run that never exported. A test hook
`DirectorRuntime._delegate(network, agent, args, settings, depth)` runs one
sub-agent directly so tests can assert the return format and the depth
limit without a full director run.

**Step 2 — tests.** `tests/demo-flow.test.js` gained 13 stub-model tests
(mock `fetch` intercepts `/chat/completions`; everything else delegates to
the real file fetch): positive director→caster→writer→exporter end to end
(completes, storyboard exported with 1 scene, `run()` returns scenes,
delegation logged for all three agents); sub-agent return format
(`{ok, agent, payload}` with `payload.library === "Anime.js"`);
depth-3 limit (`delegate_depth`); negative case — a site action throwing
inside a sub-agent fails the whole run with no partial download; permission
errors when caster tries `particle_writer` (delegation) and
`website_render_scene` (site action outside its tools); static cycle
rejection; manifest-links-first peer loading; endless delegation failing
closed over 30 calls (`budget_exceeded`). **Result: 40/40 pass — all 27
original demo tests still pass plus 13 new.**

**Cheap compliance fixes (Doubao gap list, items 6–8) — all three done:**
6. `validateNetwork()` now detects delegation cycles statically
   (`A → B → A` throws `schema_violation`) instead of only catching them at
   runtime via the depth limit.
7. Peer loading reads the manifest's `links` field (falls back to
   `links.json`) instead of hardcoding the `links.json` path; the manifest
   is now fetched before the links file.
8. Errors are standardised with codes instead of bare JS Error strings:
   `budget_exceeded`, `delegate_depth`, `schema_violation`, `peer_denied`,
   plus `permission_denied` (tool outside an agent's declared tools /
   second-level delegation) and `model_error` (router call failed). The code
   list is exposed as `DirectorRuntime.errorCodes`.

**Open items from the Doubao gap list (deliberately left for later):**
router fallback metadata, cross-origin peers, peer-manifest validation,
structured JSON audit log export, JSON Schema input validation.

## Round 2 verification (2026-11-21, DOM-stubbed, no real browser on box)

Ran `tests/demo-flow.test.js` (fake DOM + fetch-from-disk, runs the real
`site-actions.js`, `runtime.js` and the `index.html` inline script):
**27/27 checks pass.** Verified: all 4 JSON files parse and cross-check
(manifest `links` → `links.json` → `./critic.network.json` → manifest
`critic` hocon); `validateNetwork()` passes for both networks; critic
declares a structured output schema (score 0–10, max 3 fixes, note);
all 3 site actions exist and `index.html` loads `site-actions.js` before
`runtime.js`; classifier 10/10 on the 5 preset scenes + 5 extra;
consent modal shows peer origin + purpose before any peer fetch;
accept → peer loaded via `links.json`, verdict shown, storyboard JSON
downloaded (5 scenes); deny → zero peer fetches, honest "review skipped"
message; a second run works; a 20-scene run fails closed with a visible
"Over budget" error; BYOK save/clear round-trips localStorage; activity
log records runtime/consent/agent events.

### Real bugs found and fixed in this round (Doubao round 1 did NOT see them —
### it only had 4 files attached, so it never saw `site-actions.js`,
### `critic.network.json`, `links.json` or `index.html`)

1. `site-actions.js`: `website_cast_scene` returned `library: c.name`, but
   `classify()` returns `library`, not `name` — **every scene's library was
   `undefined`** and the page would have shown "Scene 1 — undefined".
   Fixed to `c.library`.
2. `site-actions.js`: the word "launch" alone was a particles signal, so the
   headline "Our app launches next week." cast to Proton instead of kinetic
   type. "launch" removed from the particles signals (a bare launch is a
   product launch; a particle burst needs a second energy signal).
3. `runtime.js`: the peer check read `net.name`, but in this data model the
   network name lives in `metadata.name` — the critic check always threw.
   Fixed to `net.metadata.name`.
4. `runtime.js`: peer loading ignored `links.json` entirely and `links.json`
   mapped critic to a bare name, not a file. Now `links.json` maps critic to
   `./critic.network.json`, the runtime resolves the peer through it (after
   consent), validates the network, and cross-checks the manifest hocon;
   off-origin peer links are refused.
5. `runtime.js`: `run()` re-wrapped already-wrapped actions on a second run,
   so a stale inner call counter could throw "Over budget" on a legal run.
   Now the original actions are kept in `__original` and always re-wrapped
   from the originals.
6. `runtime.js`: `MAX_TOOL_CALLS` 12 was too low for demo mode (2 calls per
   scene + export — a 6-scene script failed). Raised to 30 (≈14 scenes);
   the bound is still enforced and tested.
7. `index.html`: on consent-deny it rendered `board.critic.score`, which does
   not exist on a denied verdict ("Critic peer verdict: undefined"). Now
   renders an honest "review skipped" message.
8. `critic.network.json`: added the structured output schema (score, fixes
   max 3, note) to the critic function definition.

### Known limitation — RESOLVED 2026-11-21 (Doubao round 2, steps 1–2)

- **LLM mode agent-to-agent delegation is now implemented and tested**
  (see "Round 2 implementation" above): the delegation intercept, shared
  budget, depth limit, permission errors and fail-closed behaviour are all
  in `runtime/runtime.js`, verified by 13 stub-model tests (40/40 total).
  What is still untested is LLM mode against a **real router with a real
  key** (BYOK live test) — the stub only proves the delegation machinery,
  not that a real model will call the tools in the right order. Do not claim
  LLM mode works end to end with a real model until the BYOK live test is
  done in a real browser.
