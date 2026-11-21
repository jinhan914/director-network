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
effect classification, **and declared in `director.network.json` itself** as
`kind: "site_action"` entries in the network's `tools` array (round 4): each
carries `function.description`, a `function.parameters` JSON Schema matching
the real handler arguments, `effect` (read/write) and `handler:
"./site-actions.js"`. That is the spec's own shape for grounded capability
(§2.1: a runtime MAY expose a catalog of registered site actions; §3.1: site
actions are described by name, purpose, JSON Schema, effect and handler) —
and it is what the reference runtime's validator needs to resolve an agent's
tool reference without knowing this site's runtime. The runtime validates
arguments and shows the user the destination and arguments before any write.
No site action touches the network, sends data off-origin, or spends money.
Site actions are tools, never delegation targets: the runtime's agent lookup
excludes them, a model call naming one is dispatched to the handler (never
run as a sub-agent), and `validateNetwork()` rejects a site action declared
without a JSON Schema or effect, and rejects any reference it cannot resolve.

## Conformance map (MVP Profile 0.3)

| Spec requirement | How this project meets it |
|---|---|
| Manifest `agent-manifest.json` | Published at site root; networks `director` + `critic`, each with `front_man` (spec field; `front_agent` kept as an alias for this runtime) and `hocon` (`./<network>.network.json`, resolved JSON path); `llm_router` with `base_url` + `byok_router` as the user-configurable placeholder `https://YOUR_ROUTER_BASE_URL/v1` (no default router, no Otari — see "Round 3 fixes"); `deployment` = static / self-contained runtime / direct BYOK; `actions.version` = 1, `module` = `./site-actions.js`, plus an `actions.note` documenting that there is deliberately no `actions.bridge` (see "Round 4 fixes"); `peer_policy: "consent"`; `allowed_peers` = same origin |
| Resolved network definition | `director.network.json` + `critic.network.json`, Neuro SAN data model, JSON form, no includes/env refs; every tool reference resolves to an agent or a site action declared in the same network (round 4 — see below) |
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
  - **AgentCheck re-test (2026-11-21 12:24 CST) raised this as a tip:**
    without a bridge, a cross-site caller waits ~10 s and then fails.
    That is the *expected* outcome for a feature we intentionally do not
    offer, not a conformance failure: MVP Profile 0.3 §3.1 says
    "Cross-site action transport is an extension", and §2.1 makes it
    conditional on the origin permitting the caller. Building a bridge
    would not fix a spec gap — it would create a new trust surface
    (hidden-frame cross-site calls into a page's canvas and export) for a
    capability no caller needs. So the decision stands, and it is now
    recorded in the manifest itself (`actions.note`) as well as here, so a
    checker reading the manifest sees the reasoning instead of an
    unexplained absence. What breaks without it: nothing on this site —
    only a hypothetical cross-site caller that wants to drive this page's
    canvas, which the spec does not require us to support.
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
- [x] AgentCheck (https://agentcheck.netlify.app) run on the published URL;
      all 34 rules pass or are documented — first run 2026-11-21: NOT
      CONFORMING YET, 7 passed / 2 MUST failed / 2 tips (see "Round 3
      fixes"). **Re-test 2026-11-21 12:24 CST: 29 passed / 1 MUST failed /
      9 tips** — the remaining MUST was the undeclared site-action tools
      (see "Round 4 fixes" below). **Re-test 2026-11-21 12:35 CST:
      35 passed / 1 MUST failed / 3 tips** — the validator MUST now
      passes for both networks; the remaining MUST is a side effect of
      the round-4 fix: AgentCheck treats the 3 site-action entries as
      agents and requires instructions for each (see "Round 5 fixes"
      below). **Re-test 2026-11-21 12:47 CST: CONFORMING, 35 passed /
      0 failed / 4 tips** — every MUST passes; the 4 tips are the
      bridge (intentionally not built, see "Deliberately out of scope"),
      the site actions' missing tools list, and the peer rule in both
      front agents' instructions (see "Round 6 fixes" below). Must
      re-run after re-uploading the round-6 fixed files — the bridge tip
      is expected to remain.
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

## Round 4 fixes — AgentCheck re-test MUST + tips (2026-11-21)

Re-test 2026-11-21 12:24 CST on the re-uploaded site: **29 passed, 1 MUST
failed, 9 tips.** The one MUST failure: "Passes the reference runtime's
validator §3.1" — "Agent 'caster' references missing tool
'website_cast_scene'. Agent 'kinetic_writer' references missing tool
'website_render_scene'. ... (all writers)". The tools were real and
implemented (site-actions.js / window.DirectorActions) but were not defined
inside the network, so an external validator could not see them. Checked
against MVP Profile 0.3 (spec repo re-cloned to /tmp only to read the spec
text; no reference runtime/bridge code copied — the runtime remains
self-written): §2.1 allows a catalog of registered site actions and §3.1
requires them to be described by name, purpose, JSON Schema, effect and
handler; the reference example network resolves every tool reference to an
entry in its `tools` array, each with `function.parameters`, and carries
top-level `llm_config.model_name` and `max_execution_seconds`.

1. **MUST fix — site actions declared in the network.**
   `director.network.json` now carries the three tools as `kind:
   "site_action"` entries in its `tools` array, each with
   `function.description`, a `function.parameters` JSON Schema matching the
   real handler arguments (cast: `scene` required; render: `kind` enum of
   the 5 styles + `scene` required; export: `storyboard` required),
   `effect` (read / write) and `handler: "./site-actions.js"`. The
   references were kept — the tools are real. Runtime behaviour is
   identical: demo mode calls `window.DirectorActions` directly; LLM mode
   dispatches the same names. What changed in `runtime/runtime.js` is the
   bookkeeping: site-action entries are excluded from the agent lookup
   (`findAgent` / `agentNames` / cycle detection), `validateNetwork()`
   resolves a reference against agents + declared site actions +
   runtime-registered actions, rejects a site action without a JSON Schema
   or effect, and `dispatchTool()` handles a site-action call first so it
   can never be mistaken for a delegation to a sub-agent;
   `toolsForAgent()` now hands the model the schema declared in the
   network instead of a generic one.
2. **Tip (a) — invocation schemas.** Every callable agent now has
   `function.parameters`: director `{script}`, caster/writers `{scene,
   index}`, exporter `{storyboard}`, critic `{storyboard}` (critic keeps
   its structured `output` schema too).
3. **Tip (b) — model name.** Both networks now carry top-level
   `llm_config.model_name: "gpt-4o-mini"` — the honest default: it is the
   model the UI defaults to (`index.html` falls back to `gpt-4o-mini`
   when the settings field is empty), with a note that it is a default
   only and BYOK lets the visitor choose their own model, per spec §2.1
   (the caller's router and model policy take precedence).
4. **Tip (c) — bounded execution declared.** `director.network.json`
   now declares `max_execution_seconds: 60`, `max_tool_calls: 30`,
   `max_delegation_depth: 3` — the exact limits the runtime already
   enforces (tests assert they match `DirectorRuntime.limits`);
   `critic.network.json` declares `max_execution_seconds: 60`.
5. **Tip (d) — peer rule for the front agent.** `director.network.json`
   now carries a top-level `peer_policy` (`mode: "consent"`,
   `allowed_peers: ["self"]`, with the consent-gated same-origin policy
   spelled out) and the director's instructions now state the rule in
   words: only contact the `critic` peer listed in `links.json`, only
   after user consent, only same-origin; never contact another site's
   peer, never send the visitor's key or unapproved data.
6. **Bridge tip — decided, not built.** See "Deliberately out of scope /
   No action bridge": cross-site action transport is a §3.1 extension,
   not a conformance requirement; a bridge would create a hidden-frame
   cross-site call surface into this page's canvas/export for a
   capability no caller needs. The decision is now recorded in the
   manifest itself (`actions.note`), not just in this file.

Tests: `tests/demo-flow.test.js` now **64/64 pass** (53 before + 11 new
round-4 checks, including the reference-resolution mirror, schema/effect/
handler checks, the three runtime rejection cases, and the
site-action-is-not-an-agent check). All 4 JSON files parse; `node --check`
passes on `runtime/runtime.js` and `site-actions.js`.

Still open after round 4: **AgentCheck re-run on the re-uploaded site**
(parent, browser) — this is the final check on whether the MUST failure
is resolved; BYOK live test with a real key; screenshots; video.

## Files changed in round 4 (re-upload all of these)

- `director.network.json` — 3 site-action entries, parameters schemas on
  all 8 agents, `llm_config`, bounds, `peer_policy`, peer rule in the
  director instructions
- `critic.network.json` — parameters schema on critic, `llm_config`,
  `max_execution_seconds`
- `runtime/runtime.js` — site-action vs agent distinction in validation,
  lookup, tool schemas and dispatch
- `agent-manifest.json` — `actions.note` documenting the no-bridge
  decision (reformatted with sorted keys; content otherwise unchanged)
- `tests/demo-flow.test.js` — 11 new round-4 checks (64/64 total)
- `DESIGN.md` — this section, conformance map, checklist, bridge
  decision

## Round 5 fixes — AgentCheck re-test MUST + tips (2026-11-21)

Re-test 2026-11-21 12:35 CST on the re-uploaded site: **35 passed, 1 MUST
failed, 3 tips.** The validator MUST now passes for both networks. The
one remaining MUST failure is a side effect of the round-4 fix:
"Every agent has a name, a function description, instructions and a
tools list §2.1" — AgentCheck now treats the 3 site-action entries
(`website_cast_scene`, `website_render_scene`,
`website_export_storyboard`) as agents and requires `instructions`
for each.

1. **MUST fix — instructions on the 3 site actions.**
   `director.network.json` now gives each site-action entry an
   `instructions` field in plain language: what the action does, its
   inputs, and its effect. Cast: runs the deterministic keyword
   classifier on the scene, returns library + reason + rejected
   alternatives + signals; read-only. Render: draws the scene on the
   stage canvas in the given kind; write to the local UI only.
   Export: returns the full storyboard JSON as a downloadable file;
   read-only. Each states it is a grounded site action, not an LLM
   agent (no model call, no network request).
   `function.description`, `function.parameters`, `effect` and `handler`
   are unchanged. `runtime/runtime.js` `validateNetwork()` accepts the
   extra field (it never rejected unknown fields) and now *requires*
   instructions on every site action, so the fix is self-enforcing;
   the stale comment claiming site actions "have no instructions" was
   corrected — they carry instructions for validators but are still
   never run as sub-agents (`dispatchTool` handles them first,
   `findAgent` excludes them).
2. **Tip — peer rule in the front agents' instructions.** The director
   already had it (round 4 tip d, asserted by the existing test): only
   contact the `critic` peer listed in `links.json`, only after user
   consent, only same-origin; never contact another site's peer, never
   send the visitor's key or unapproved data. The critic's instructions
   now carry the same rule in words: it runs in the visitor's browser
   and only reviews the storyboard the user approved; never contacts
   any other peer network, never sends the visitor's key or any data
   outside the approved storyboard, never loads a network from another
   site. (`critic.network.json` has no site actions, so no fix was
   needed there.)

Tests: `tests/demo-flow.test.js` now **69/69 pass** (64 before + 5 new
round-5 checks: instructions present on all 3 site actions with
what/inputs/effect; instructions match the real behaviour; validateNetwork
accepts the entries and rejects one declared without instructions; a
site action with instructions is still not a delegatable agent; both
front agents' instructions state the peer rule). All 4 JSON files parse;
`node --check` passes on `runtime/runtime.js` and `site-actions.js`.

Still open after round 5: **AgentCheck re-run on the re-uploaded site**
(parent, browser) — this is the final check on whether the last MUST
failure is resolved; BYOK live test with a real key; screenshots; video.

## Files changed in round 5 (re-upload all of these)

- `director.network.json` — `instructions` added to all 3 site-action
  entries (function.description, parameters, effect, handler unchanged)
- `critic.network.json` — peer-rule sentence added to the critic front
  agent's instructions
- `runtime/runtime.js` — `validateNetwork()` now requires instructions
  on site actions; stale "no instructions" comment corrected
- `tests/demo-flow.test.js` — 5 new round-5 checks (69/69 total)
- `DESIGN.md` — this section, checklist

## Round 6 fixes — AgentCheck re-test tips (2026-11-21)

Re-test 2026-11-21 12:47 CST on the re-uploaded site: **CONFORMING,
35 passed, 0 failed, 4 tips.** Every MUST rule passes. This round reads
the checker's own source (`pratikpoddar/agentcheck`,
`site/lib/checker.js`, commit `643d173`) instead of guessing at the
wording — the exact test for each tip is quoted below.

1. **Tip (1) — action bridge: NOT fixable honestly, stays open by
   design.** `checkBridge()` (checker.js L1106–1133) runs whenever the
   manifest declares an `actions` object, and warns unless
   `actions.bridge` exists, is same-origin, loads with HTTP 200, sends
   no `X-Frame-Options`, has no `frame-ancestors 'none'/'self'` CSP,
   contains a `<script type="module">`, and has its own
   `agent-manifest.json` in the bridge folder. There is **no honest
   "no bridge" declaration** that clears it: pointing `actions.bridge`
   at a page that is not a bridge would fail the same check (or worse,
   claim a bridge that does not work), and deleting the `actions`
   object would hide three real, published, working local actions just
   to dodge the check. The decision from rounds 3–4 stands (see
   "Deliberately out of scope / No action bridge"): cross-site action
   transport is a §3.1 extension, not a conformance requirement, and a
   bridge would open a hidden-frame cross-site call surface into this
   page's canvas and export for a capability no caller needs. The
   manifest already documents this in `actions.note`. Expected
   outcome on the next re-test: this one tip remains; the verdict
   stays CONFORMING.
2. **Tip (2) — site actions need a tools list.** AgentCheck's §2.1
   check treats every entry in a network's `tools` array uniformly
   ("Use [] to declare none"). All 3 site-action entries in
   `director.network.json` now declare `"tools": []`. `runtime.js`
   `validateNetwork()` accepts the empty list and now *rejects* a site
   action that declares a non-empty tools list (a site action claiming
   tools would be a lie — site actions call nothing); the stale comment
   claiming site actions "have no tools list" was corrected.
3. **Tips (3)+(4) — peer rule in both front agents' instructions.**
   The check (checker.js L619–633) is
   `front.instructions.includes("When you have no website_* tools") ||
   /another (site|agent site)'?s? (assistant|agent)/i` — it tests the
   **inbound** direction: another site running *our* network as a peer,
   where it has none of our `website_*` tools, and how the front agent
   should answer that site's assistant. The "Peer rule" sentences added
   in rounds 4–5 were the **outbound** direction (this site contacting
   peers only with consent) — a real rule, but not the one the checker
   tests, which is why both tips survived round 5 even though the
   outbound rule was present in both instructions. Both front agents
   now carry the inbound rule in words, each honest about what it can
   and cannot do without its site tools (rules.js `network.peer_rule`
   fix text: "When you have no website_* tools, another site's
   assistant is asking..."):
   - Director: "When you have no website_* tools, another site's
     assistant is asking you to direct an animation with only the
     script it gave you: describe the scenes and the library you would
     cast each one to, with reasons, in plain text. Say plainly that
     you cannot render a preview or export a storyboard without your
     own site's tools, and never invent a render receipt or a download
     link."
   - Critic: "When you have no website_* tools, another site's
     assistant is asking you to review a storyboard with only the text
     it gave you: judge it on pacing, clarity and library fit and
     return your verdict as text. You need no site tools for this
     review, and never claim you called one."
   The outbound consent rules are kept unchanged alongside them.

Tests: `tests/demo-flow.test.js` now **73/73 pass** (69 before + 4 new
round-6 checks: tools: [] on all 3 site actions; validateNetwork
accepts tools:[] and rejects a non-empty tools list on a site action;
both front agents' instructions contain the inbound peer-rule sentence
with "another site's assistant"; the inbound rule is honest about
capabilities). All 4 JSON files parse; `node --check` passes on
`runtime/runtime.js` and `site-actions.js`.

Still open after round 6: **AgentCheck re-run on the re-uploaded site**
(parent, browser) — expected: 35+ passed, 0 failed, 1 tip (bridge, by
design); BYOK live test with a real key; screenshots; video.

## Files changed in round 6 (re-upload all of these)

- `director.network.json` — `"tools": []` on all 3 site-action
  entries; inbound peer-rule sentence added to the director front
  agent's instructions
- `critic.network.json` — inbound peer-rule sentence added to the
  critic front agent's instructions
- `runtime/runtime.js` — `validateNetwork()` rejects a site action
  with a non-empty tools list; stale "no tools list" comment corrected
- `tests/demo-flow.test.js` — 4 new round-6 checks (73/73 total)
- `DESIGN.md` — this section, checklist

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
