# Director Network — an open agentic website

**Competition:** Open Agentic Web Challenge (Devpost, hosted by Cognizant, with MIT NANDA, Mozilla Otari, AWS)
**Prizes:** $10,000 cash — 1st $5,000, 2nd $3,000, 3rd $2,000 (+ Otari credits, SWAG)
**Deadline:** 2027-01-11 16:00 UTC (11:00 EST) · Judging 2027-01-11 → 01-18 · Winners ~2027-01-19 (Davos)
**Status:** scaffold built 2026-11-21, Doubao round 1 pending (parent must send via browser — subagents cannot open Doubao)

## What it is

SLAY HACKS entry "Director — AI Animation Director" (paste a script → cast each
scene to the right animation library → generate code → live preview), rebuilt as
a **conforming open agentic website** under the Worldwide Agentic Web MVP
Profile 0.3 (18 Nov 2026, Cognizant AI Lab, spec repo commit `f154be8`).

Instead of one hard-coded page, the product is a **published agent network**:

- **Director network** (`director.network.json`) — front agent `director` takes a
  script, splits it into scenes, and delegates each scene to a specialist agent:
  `caster` (chooses the library), `kinetic_writer` (Anime.js), `diagram_writer`
  (Motion Canvas), `formula_writer` (Manim), `spatial_writer` (Three.js),
  `particle_writer` (Proton), `exporter` (storyboard JSON). The specialists call
  grounded site actions (`website_cast_scene`, `website_render_scene`,
  `website_export_storyboard`) that run the same deterministic casting engine
  proven in SLAY (classifier 12/12, Doubao round 3 approved).
- **Critic network** (`critic.network.json`) — a **peer network** on the same
  origin. After the user consents, the Director runtime loads it by URL and runs
  it in the visitor's browser, on the visitor's key. It reviews the storyboard
  for pacing, clarity and library-fit, and returns a structured verdict. This is
  the spec's peer-loading behaviour, demonstrated end-to-end.
- **Browser runtime** (`runtime/runtime.js`, written from scratch for this
  project — not a copy of the reference runtime): validates manifest + network,
  runs the agent loop with model streaming, tool calls and delegation, enforces
  bounds (max 30 tool calls, 60 s, depth 3), asks for consent before any
  peer contact, and never sends the visitor's key to a peer site.
- **BYOK model settings** — the visitor picks an OpenAI-compatible router,
  model and key. The key lives in the visitor's browser (localStorage, deletable)
  and is attached only to model requests. **Demo mode works with no key at all:**
  casting, rendering and export are deterministic local operations, so judges
  can test the whole product free of charge.

## Why this wins on the rubric

- **Technological Implementation:** full MVP conformance — manifest, resolved
  network JSON, runtime, interface, BYOK, peer loading with consent, CORS-ready
  static hosting. Conformance is checkable with AgentCheck (34 spec rules).
- **Design:** a complete product, not a proof of concept — the SLAY demo was
  already a finished UX (presets, pacing, storyboard export); the network just
  makes its decisions inspectable and portable.
- **Potential Impact:** the real problem is concrete — every creator who writes
  a script needs animation but cannot pick a library or write the code. The
  network is reusable: any site can call `director` by URL and get casting
  decisions for its own copy. A `links.json` peer map is published for that.
- **Quality of the Idea:** an animation director as a *portable, discoverable
  agent network* — not a chatbot wrapper. The casting decision is data (the
  network JSON is public), the rendering is a site action, and the critic is a
  peer. That is the agentic web's own thesis, demonstrated on a real product.

## Files (this folder)

| File | What it is |
|---|---|
| `index.html` | The agentic website: script input, chat with the director network, stage preview, model settings, peer consent, activity log |
| `agent-manifest.json` | Published manifest: networks, front agents, router metadata, peer policy (`allowed_peers` = same origin only by default) |
| `director.network.json` | Resolved network definition (Neuro SAN data model, JSON form) |
| `critic.network.json` | Peer network definition (reviewer) |
| `links.json` | Peer-network link map (`critic` → critic network URL) |
| `runtime/runtime.js` | Minimal conforming browser runtime (own implementation) |
| `site-actions.js` | Grounded site actions bridging the network to the SLAY preview engine |
| `DESIGN.md` | Architecture + spec conformance map + what is deliberately out of scope |
| `VIDEO_SCRIPT.md` | <2 min demo script — **David must present on camera himself** (rules: entrant explaining, not AI generated) |
| `screenshots/` | Screenshots for the Devpost submission (to be taken once published) |

## Rules verified (live, 2026-11-21, https://cognizant-agenticweb.devpost.com/)

- Submission needs: public site URL with conforming `.json` network file +
  runtime file + user/agent interface + optional LLM/key config UI; text
  description; **video <2 min, entrant explaining on camera (not AI
  generated), publicly visible on YouTube**; 1+ screenshots.
- Judging: Technological Implementation, Design, Potential Impact, Quality of
  the Idea.
- Eligibility: open to developers worldwide; exclusions include Brazil, Quebec
  and sanctioned jurisdictions (per the rules summary — re-check the full rules
  at submission time). **US-based David is eligible.** Existing projects are
  allowed if significantly updated during the submission period — this project
  documents its starting state (the SLAY demo) and the changes made after
  2026-11-11 in `DESIGN.md`.
- Otari: only relevant if the project uses Mozilla Otari — it does not (BYOK
  uses any OpenAI-compatible router). No Otari email / problem statement needed.

## What still needs David (only he can do these)

1. **Demo video, on camera, <2 min, public YouTube** — he must explain the
   project himself in a browser. Script is in `VIDEO_SCRIPT.md`. Do not fake it
   with AI narration; the rules explicitly forbid AI-generated explanation.
2. **Register on Devpost** for the challenge (one click, jinhan914 account).
3. Nothing else is blocked on him: no key, no payment, no phone step.

## Next steps

1. Doubao round 1 (parent, browser): send `DESIGN.md` + `director.network.json`
   + `agent-manifest.json` + `runtime/runtime.js` — prompt in
   `files/doubao-reviews/open-agentic-web.md`. Max 3 rounds.
2. Apply fixes, run local conformance checks (manifest validates, network
   validates, demo mode end-to-end, peer load with consent, BYOK path with a
   test key, AgentCheck once published).
3. Publish: new GitHub repo `jinhan914/director-network`, GitHub Pages on.
4. Screenshots, David's on-camera video, Devpost submit before 2027-01-11.

## Relationship to the other projects

- **SLAY (submitted 2026-11-21, ID 1313839):** the starting state. Its
  classifier, library picks and preview engine are reused; the network, runtime,
  peer critic and BYOK are new work done after the submission period opened.
- **BNB DirectorID:** the Agent ID identity layer (Director Pass, on-chain
  storyboard hash) is an *optional extension* here, not part of MVP
  conformance. If BNB succeeds, the same storyboard hash can be published from
  this site as a signed authorship record — documented in `DESIGN.md`, not built
  into the network.
