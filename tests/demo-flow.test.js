// DOM-stubbed end-to-end test for Director Network (open-agentic-web).
// No real browser on this box: fake DOM + fetch from disk, run the real
// site-actions.js, runtime.js and index.html inline script.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR = path.join(__dirname, "..");
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra ? " :: " + extra : "")); }
}

const downloads = [];
const fetchLog = [];
const alerts = [];
const blobStore = {};
let blobN = 0;

function makeCtx() {
  return new Proxy({}, {
    get(t, p) { if (p in t) return t[p]; return function () {}; },
    set() { return true; }
  });
}
function makeEl(id) {
  const el = {
    id: id || "", value: "", textContent: "", checked: false,
    style: {}, children: [], scrollTop: 0, scrollHeight: 0,
    onclick: null, href: "", download: "",
    _html: "",
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; },
    appendChild(c) { this.children.push(c); return c; },
    getContext() { return makeCtx(); },
    click() {
      if (this.download) {
        const b = blobStore[this.href];
        downloads.push({ name: this.download, content: b ? b.parts.join("") : null });
      }
      if (this.onclick) return this.onclick();
    }
  };
  return el;
}

const ids = ["script", "ask-critic", "direct", "preset-launch", "preset-maths",
  "stage", "stage-note", "choices", "download-board", "download-note", "log", "baseUrl", "model", "apiKey",
  "save-key", "clear-key", "consent", "consent-text", "consent-yes", "consent-no"];
const registry = {};
ids.forEach(id => { registry[id] = makeEl(id); });

const store = {};
const sandbox = {
  console,
  location: { origin: "http://localhost:8000", pathname: "/index.html" },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  document: {
    getElementById: id => registry[id] || makeEl(id),
    createElement: tag => makeEl(tag)
  },
  fetch: async (url) => {
    fetchLog.push(String(url));
    const clean = String(url).replace(/^https?:\/\/[^/]+\//, "").replace(/^\.\//, "");
    const file = path.join(DIR, clean);
    if (!fs.existsSync(file)) throw new Error("fetch 404: " + url);
    const text = fs.readFileSync(file, "utf8");
    return { ok: true, json: async () => JSON.parse(text), text: async () => text };
  },
  Blob: class { constructor(parts) { this.parts = parts; } },
  URL: { createObjectURL: (b) => { const u = "blob:" + (++blobN); blobStore[u] = b; return u; } },
  alert: (m) => { alerts.push(m); },
  setTimeout, clearTimeout
};
sandbox.window = sandbox;
vm.createContext(sandbox);

function runFile(rel) {
  vm.runInContext(fs.readFileSync(path.join(DIR, rel), "utf8"), sandbox, { filename: rel });
}
function runCode(code, name) { vm.runInContext(code, sandbox, { filename: name }); }

runFile("site-actions.js");
runFile("runtime/runtime.js");
const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
check("index.html has exactly 1 inline script", inlineScripts.length === 1);
runCode(inlineScripts[0], "index-inline.js");

(async () => {
  const R = sandbox.DirectorRuntime, A = sandbox.DirectorActions;

  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "agent-manifest.json"), "utf8"));
  const director = JSON.parse(fs.readFileSync(path.join(DIR, "director.network.json"), "utf8"));
  const critic = JSON.parse(fs.readFileSync(path.join(DIR, "critic.network.json"), "utf8"));
  const links = JSON.parse(fs.readFileSync(path.join(DIR, "links.json"), "utf8"));
  check("manifest.links === 'links.json'", manifest.links === "links.json");
  check("links.json maps critic to ./critic.network.json",
    links.networks && links.networks.director && links.networks.director.critic === "./critic.network.json");
  const norm = p => String(p || "").replace(/^\.\//, "");
  check("manifest critic hocon matches links.json target (normalising './')",
    norm(manifest.networks.find(n => n.name === "critic").hocon) === "critic.network.json");
  check("manifest director hocon = director.network.json (normalising './')",
    norm(manifest.networks.find(n => n.name === "director").hocon) === "director.network.json");
  // --- Real-browser test + AgentCheck fixes (round 3, 2026-11-21) ---
  // AgentCheck MUSTs: networks need name + front_man + hocon; llm_router
  // needs base_url or byok_router. Spec is MVP Profile 0.3, which itself
  // requires front_man in the manifest — front_agent is kept only as an
  // alias for this runtime's own files.
  check("manifest networks each have name + front_man + hocon (front_man === front_agent)",
    manifest.networks.every(n => n.name && n.front_man && n.hocon &&
      n.front_man === n.front_agent && n.hocon.startsWith("./") && n.hocon.endsWith(".network.json")));
  check("manifest llm_router has base_url + byok_router (user-configurable placeholder, no Otari)",
    manifest.llm_router && manifest.llm_router.base_url && manifest.llm_router.byok_router &&
    /YOUR_ROUTER/.test(manifest.llm_router.base_url) &&
    !/otari\.ai/i.test(JSON.stringify(manifest)));
  check("manifest deployment metadata: static + self_contained_runtime + direct_byok",
    manifest.deployment && manifest.deployment.mode === "static" &&
    manifest.deployment.self_contained_runtime === true &&
    manifest.deployment.direct_byok === true);
  check("manifest actions.version === 1 and module === ./site-actions.js",
    manifest.actions && manifest.actions.version === 1 &&
    manifest.actions.module === "./site-actions.js");
  // --- Round 4 fixes (2026-11-21, after AgentCheck re-test 12:24 CST:
  // 29 passed / 1 MUST failed / 9 tips) ---
  // MUST: "Passes the reference runtime's validator §3.1" — agents
  // referenced website_cast_scene / website_render_scene, but those tools
  // were not defined inside the network. They are now declared as
  // site_action entries in the network's tools array (spec §2.1: a runtime
  // MAY expose a catalog of registered site actions; §3.1: described by
  // name, purpose, JSON Schema, effect and handler), so every reference
  // resolves without removing the tools or changing runtime behaviour.
  const isSiteAction = e => e && e.kind === "site_action";
  const agentsOf = net => net.tools.filter(e => !isSiteAction(e));
  const siteActionsOf = net => net.tools.filter(isSiteAction);
  const resolvable = net => {
    const names = new Set([...agentsOf(net).map(a => a.name), ...siteActionsOf(net).map(t => t.name)]);
    return agentsOf(net).every(a => (a.tools || []).every(t => typeof t !== "string" || names.has(t)));
  };
  check("round 4 MUST: every tool reference in director resolves to an agent or a declared site action",
    resolvable(director), JSON.stringify(director.tools.map(t => t.name)));
  check("round 4 MUST: the 3 site actions are declared in director.tools with description + JSON Schema + effect + handler",
    siteActionsOf(director).length === 3 &&
    ["website_cast_scene", "website_render_scene", "website_export_storyboard"]
      .every(n => siteActionsOf(director).some(t => t.name === n)) &&
    siteActionsOf(director).every(t => t.function && t.function.description &&
      t.function.parameters && t.function.parameters.type === "object" &&
      Array.isArray(t.function.parameters.required) &&
      ["read", "write"].includes(t.effect) && t.handler === "./site-actions.js"));
  check("round 4 MUST: site-action schemas match the real handlers (cast needs scene; render needs kind+scene; export needs storyboard)",
    siteActionsOf(director).find(t => t.name === "website_cast_scene").function.parameters.required.includes("scene") &&
    siteActionsOf(director).find(t => t.name === "website_render_scene").function.parameters.required.includes("kind") &&
    siteActionsOf(director).find(t => t.name === "website_render_scene").function.parameters.properties.kind.enum.length === 5 &&
    siteActionsOf(director).find(t => t.name === "website_export_storyboard").function.parameters.required.includes("storyboard"));
  check("round 4 tip (a): every callable agent has function.parameters JSON Schema (director + critic)",
    [...agentsOf(director), ...agentsOf(critic)].every(a =>
      a.function && a.function.parameters && a.function.parameters.type === "object" &&
      Array.isArray(a.function.parameters.required) && a.function.parameters.required.length > 0));
  check("round 4 tip (b): llm_config.model_name is the honest UI default (gpt-4o-mini) in both networks, BYOK note present",
    director.llm_config && director.llm_config.model_name === "gpt-4o-mini" &&
    critic.llm_config && critic.llm_config.model_name === "gpt-4o-mini" &&
    /BYOK/.test(director.llm_config.note || ""));
  check("round 4 tip (c): bounded execution declared in the network and matches the runtime limits (30 calls / 60s / depth 3)",
    director.max_execution_seconds === 60 && director.max_tool_calls === 30 &&
    director.max_delegation_depth === 3 &&
    R.limits.maxToolCalls === director.max_tool_calls &&
    R.limits.maxSeconds === director.max_execution_seconds &&
    R.limits.maxDepth === director.max_delegation_depth &&
    critic.max_execution_seconds === 60);
  check("round 4 tip (d): director network declares a peer rule (consent-gated, same-origin only)",
    director.peer_policy && director.peer_policy.mode === "consent" &&
    Array.isArray(director.peer_policy.allowed_peers) &&
    director.peer_policy.allowed_peers.join() === "self" &&
    /only contact the 'critic' peer/.test(
      director.tools.find(a => a.name === "director").instructions || ""));
  check("round 4 bridge decision: manifest documents that no actions.bridge exists, by design (cross-site transport is a §3.1 extension)",
    manifest.actions && typeof manifest.actions.note === "string" &&
    /No actions\.bridge/.test(manifest.actions.note) &&
    /extension/.test(manifest.actions.note) && !("bridge" in manifest.actions));
  const badRef = JSON.parse(JSON.stringify(director));
  badRef.tools.find(a => a.name === "caster").tools = ["website_nonexistent"];
  let badRefErr = null;
  try { R.validateNetwork(badRef); } catch (e) { badRefErr = e; }
  check("round 4: validateNetwork still rejects an agent referencing an unknown tool",
    badRefErr && badRefErr.code === "schema_violation" && /website_nonexistent/.test(badRefErr.message),
    badRefErr && (badRefErr.code + ": " + badRefErr.message));
  const badSchema = JSON.parse(JSON.stringify(director));
  delete badSchema.tools.find(t => t.name === "website_cast_scene").function.parameters;
  let badSchemaErr = null;
  try { R.validateNetwork(badSchema); } catch (e) { badSchemaErr = e; }
  check("round 4: validateNetwork rejects a site action declared without a JSON Schema",
    badSchemaErr && badSchemaErr.code === "schema_violation" && /JSON Schema/.test(badSchemaErr.message),
    badSchemaErr && (badSchemaErr.code + ": " + badSchemaErr.message));
  let delegateSiteErr = null;
  try { await R._delegate(director, "website_cast_scene", { scene: "x" }, { key: "sk-test", baseUrl: "https://model.test/v1", model: "test-model" }, 0); } catch (e) { delegateSiteErr = e; }
  check("round 4: a site action is not a delegatable agent (_delegate to website_cast_scene throws)",
    delegateSiteErr && delegateSiteErr.code === "schema_violation" && /Unknown agent/.test(delegateSiteErr.message),
    delegateSiteErr && (delegateSiteErr.code + ": " + delegateSiteErr.message));
  // --- Round 5 fixes (2026-11-21, after AgentCheck re-test 12:35 CST:
  // 35 passed / 1 MUST failed / 3 tips) ---
  // MUST: "Every agent has a name, a function description, instructions
  // and a tools list §2.1" — AgentCheck now treats the 3 site-action
  // entries as agents and requires instructions for each. The
  // instructions describe in plain language what the action does, its
  // inputs and its effect; function.description, parameters, effect and
  // handler are unchanged.
  check("round 5 MUST: all 3 site actions carry an instructions field describing what they do, their inputs and their effect",
    siteActionsOf(director).length === 3 &&
    siteActionsOf(director).every(t => typeof t.instructions === "string" &&
      t.instructions.length > 80 &&
      /grounded site action, not an LLM agent/.test(t.instructions) &&
      /Input:/.test(t.instructions) && /Effect:/.test(t.instructions)));
  check("round 5 MUST: site-action instructions match the real behaviour (cast returns library+reason+rejected+signals; render draws on the canvas; export returns the storyboard JSON)",
    /chosen animation library, the reason for the choice, the rejected alternatives, and the keyword signals/.test(
      siteActionsOf(director).find(t => t.name === "website_cast_scene").instructions) &&
    /draws the scene on the stage canvas/.test(
      siteActionsOf(director).find(t => t.name === "website_render_scene").instructions) &&
    /returns the full storyboard JSON/.test(
      siteActionsOf(director).find(t => t.name === "website_export_storyboard").instructions));
  check("round 5 MUST: validateNetwork accepts the site actions with instructions and still rejects one declared without instructions",
    R.validateNetwork(director) === true &&
    (() => {
      const bad = JSON.parse(JSON.stringify(director));
      delete bad.tools.find(t => t.name === "website_render_scene").instructions;
      let e = null; try { R.validateNetwork(bad); } catch (err) { e = err; }
      return e && e.code === "schema_violation" && /instructions/.test(e.message);
    })());
  check("round 5 MUST: a site action with instructions is still not a delegatable agent",
    agentsOf(director).every(a => !siteActionsOf(director).some(t => t.name === a.name)) &&
    !agentsOf(director).some(a => a.name === "website_cast_scene"));
  // Tips: front-agent instructions must state the peer rule in words.
  // Director already had it (round 4 tip d, asserted above); critic
  // now has it too.
  check("round 5 tip: both front agents' instructions state the peer rule (director: critic-only after consent, same-origin; critic: approved storyboard only, no other peers)",
    /only contact the 'critic' peer/.test(
      director.tools.find(a => a.name === "director").instructions || "") &&
    /never send the visitor's key/.test(
      director.tools.find(a => a.name === "director").instructions || "") &&
    /Peer rule: you run in the visitor's browser and only review the storyboard the user approved/.test(
      critic.tools.find(a => a.name === "critic").instructions || "") &&
    /never contact any other peer network/.test(
      critic.tools.find(a => a.name === "critic").instructions || "") &&
    /never send the visitor's key/.test(
      critic.tools.find(a => a.name === "critic").instructions || ""));
  const manFrontManOnly = JSON.parse(JSON.stringify(manifest));
  manFrontManOnly.networks.forEach(n => { delete n.front_agent; });
  check("validateManifest accepts front_man-only entries",
    R.validateManifest(manFrontManOnly) === true);
  const dirFrontManOnly = JSON.parse(JSON.stringify(director));
  delete dirFrontManOnly.metadata.front_agent;
  check("validateNetwork accepts metadata.front_man as the front agent",
    R.validateNetwork(dirFrontManOnly) === true);
  check("UI hint says scenes are separated with a blank line",
    html.includes("Separate scenes with a blank line"));
  check("download button exists and is disabled in the markup (no storyboard yet)",
    html.includes('id="download-board" disabled'));
  check("validateManifest(manifest)", R.validateManifest(manifest) === true);
  check("validateNetwork(director)", R.validateNetwork(director) === true);
  check("validateNetwork(critic)", R.validateNetwork(critic) === true);
  check("critic front agent defined with structured output (score, <=3 fixes, note)",
    critic.metadata.front_agent === "critic" &&
    critic.tools[0].name === "critic" &&
    critic.tools[0].function.output &&
    critic.tools[0].function.output.properties.score &&
    critic.tools[0].function.output.properties.fixes.maxItems === 3 &&
    critic.tools[0].function.output.properties.note);

  check("window.DirectorActions exposes the 3 site actions",
    typeof A.website_cast_scene === "function" &&
    typeof A.website_render_scene === "function" &&
    typeof A.website_export_storyboard === "function");
  check("index.html loads site-actions.js BEFORE runtime/runtime.js",
    html.indexOf('src="site-actions.js"') > 0 &&
    html.indexOf('src="site-actions.js"') < html.indexOf('src="runtime/runtime.js"'));
  const cases = [
    ["Our app launches next week.", "kinetic"],
    ["The numbers tell the story: signups grew 40% in one month.", "diagram"],
    ["The formula is simple: value equals time saved.", "formula"],
    ["Watch our satellite orbit the earth, live.", "orbit"],
    ["And then — the launch. Light, noise, celebration.", "particles"],
    ["Sales data shows a 25% increase in chart results.", "diagram"],
    ["Prove the theorem: the derivative of x squared equals 2x.", "formula"],
    ["The planet spins in 3d space around the moon.", "orbit"],
    ["Fireworks explode in a burst of energy and light.", "particles"],
    ["Welcome to our story.", "kinetic"]
  ];
  let clsOk = true;
  for (const [text, want] of cases) {
    const got = A.classify(text).kind;
    if (got !== want) { clsOk = false; console.log("   classify mismatch: '" + text.slice(0, 40) + "' -> " + got + " want " + want); }
  }
  check("classifier: 10/10 spot checks (preset 5 + 5 extra)", clsOk);

  const preset = "Our app launches next week.\n\nThe numbers tell the story: signups grew 40% in one month.\n\nThe formula is simple: value equals time saved.\n\nWatch our satellite orbit the earth, live.\n\nAnd then — the launch. Light, noise, celebration.";
  registry["script"].value = preset;
  registry["ask-critic"].checked = true;
  fetchLog.length = 0; downloads.length = 0; alerts.length = 0;
  const p1 = registry["direct"].click();
  await new Promise(r => setTimeout(r, 50));
  check("consent modal shown with peer origin + purpose 'review your storyboard'",
    registry["consent"].style.display === "block" &&
    registry["consent-text"].textContent.includes("http://localhost:8000") &&
    registry["consent-text"].textContent.includes("review your storyboard"));
  check("no peer fetch before consent decision",
    !fetchLog.some(u => u.includes("links.json") || u.includes("critic.network.json")));
  registry["consent-yes"].click();
  await p1;
  const choices = registry["choices"].innerHTML;
  check("storyboard displayed: all 5 scenes with libraries",
    ["Anime.js", "Motion Canvas", "Manim", "Three.js", "Proton"].every(l => choices.includes(l)));
  check("critic verdict displayed with score, no 'undefined'",
    choices.includes("Critic peer verdict") && !choices.includes("undefined"));
  check("Director's choices show rejected alternatives + signals per scene",
    choices.includes("Rejected alternatives:") && choices.includes("Signals:"));
  check("critic now gives a real fix on the preset (scene 1 has no caster signal)",
    choices.includes("No clear signal"));
  check("download button enabled after a run",
    registry["download-board"].disabled === false);
  const dlBefore = downloads.length;
  registry["download-board"].click();
  check("download button re-downloads the 5-scene storyboard JSON",
    downloads.length === dlBefore + 1 &&
    downloads[downloads.length - 1].name === "director-storyboard.json" &&
    JSON.parse(downloads[downloads.length - 1].content).scenes.length === 5);
  check("storyboard JSON downloaded on export",
    downloads.some(d => d.name === "director-storyboard.json" &&
      d.content && JSON.parse(d.content).scenes.length === 5));
  check("peer loaded via links.json after consent",
    fetchLog.some(u => u.includes("links.json")) &&
    fetchLog.some(u => u.includes("critic.network.json")) &&
    fetchLog.some(u => u.includes("agent-manifest.json")));
  check("no error alert on accept flow", alerts.length === 0);
  if (alerts.length) console.log("   alerts:", JSON.stringify(alerts));

  registry["script"].value = preset;
  registry["ask-critic"].checked = true;
  fetchLog.length = 0; downloads.length = 0; alerts.length = 0;
  const p2 = registry["direct"].click();
  await new Promise(r => setTimeout(r, 50));
  registry["consent-no"].click();
  await p2;
  check("deny: no links/critic/manifest fetch at all",
    !fetchLog.some(u => u.includes("links.json") || u.includes("critic.network.json") || u.includes("agent-manifest.json")));
  check("deny: storyboard still renders, critic shown as skipped (not 'undefined')",
    registry["choices"].innerHTML.includes("Critic peer review skipped") &&
    !registry["choices"].innerHTML.includes("undefined"));
  check("deny: no error alert", alerts.length === 0);

  // Critic on weak input: "Hello world" (1 scene, 2 words, no signals)
  // must get real fixes, not a perfect score.
  const weak = await R.run(director, "Hello world", null, { critic: true, onConsent: async () => true });
  check("critic on 1-scene 'Hello world': 7/10 with 3 concrete fixes (not 10/10)",
    weak.critic && weak.critic.score === "7/10" && weak.critic.fixes.length === 3 &&
    weak.critic.fixes.some(f => /Only one scene/.test(f.fix)),
    JSON.stringify(weak.critic));

  registry["script"].value = preset;
  registry["ask-critic"].checked = false;
  fetchLog.length = 0;
  await registry["direct"].click();
  check("second run after a full run succeeds (no stale budget counter)",
    registry["choices"].innerHTML.includes("Anime.js") && alerts.length === 0);

  const longScript = Array.from({ length: 20 }, (_, i) => "Scene number " + (i + 1) + " with data and growth numbers.").join("\n\n");
  let threw = null;
  try {
    await R.run(director, longScript, null, { critic: false });
  } catch (e) { threw = e; }
  check("20-scene run fails closed with Over budget error",
    threw && /Over budget/.test(threw.message), threw && threw.message);

  registry["baseUrl"].value = "https://example.test/v1";
  registry["model"].value = "test-model";
  registry["apiKey"].value = "sk-test";
  registry["save-key"].click();
  check("BYOK save stores baseUrl/model/key in localStorage",
    JSON.parse(store["director-byok"] || "{}").key === "sk-test");
  registry["clear-key"].click();
  check("BYOK clear removes key from localStorage + field",
    !("director-byok" in store) && registry["apiKey"].value === "");

  check("activity log has entries (runtime/consent/agent)",
    registry["log"].children.length > 5);

  // --- LLM-mode stub tests (Doubao round 2, step 2) ---
  // Stub the model endpoint: intercept /chat/completions in the sandbox
  // fetch, delegate every other URL to the real file fetch.
  const realFetch = sandbox.fetch;
  let modelHandler = null;
  sandbox.fetch = async (url, init) => {
    if (String(url).includes("/chat/completions")) {
      if (!modelHandler) throw new Error("no model mock installed");
      const msg = await modelHandler(String(url), init);
      return { ok: true, json: async () => ({ choices: [{ message: msg }] }) };
    }
    return realFetch(url, init);
  };
  function queueModel(messages) {
    let i = 0;
    modelHandler = async () => {
      if (i >= messages.length) throw new Error("model mock exhausted at call " + i);
      return messages[i++];
    };
  }
  function tc(id, name, args) {
    return { id, type: "function", function: { name, arguments: JSON.stringify(args) } };
  }
  const LLM_SETTINGS = { key: "sk-test", baseUrl: "https://model.test/v1", model: "test-model" };
  const oneScene = "Our app launches next week.";
  const llmScript = [
    { role: "assistant", content: "", tool_calls: [tc("c1", "caster", { scene: oneScene, index: 0 })] },
    { role: "assistant", content: "", tool_calls: [tc("c2", "website_cast_scene", { scene: oneScene, index: 0 })] },
    { role: "assistant", content: "Cast: Anime.js kinetic type." },
    { role: "assistant", content: "", tool_calls: [tc("c3", "kinetic_writer", { scene: oneScene, kind: "kinetic", index: 0 })] },
    { role: "assistant", content: "", tool_calls: [tc("c4", "website_render_scene", { scene: oneScene, kind: "kinetic", index: 0 })] },
    { role: "assistant", content: "Rendered kinetic type." },
    { role: "assistant", content: "", tool_calls: [tc("c5", "exporter", { storyboard: { scenes: [{ index: 0, text: oneScene, library: "Anime.js", kind: "kinetic" }] } })] },
    { role: "assistant", content: "", tool_calls: [tc("c6", "website_export_storyboard", { storyboard: { scenes: [{ index: 0, text: oneScene, library: "Anime.js", kind: "kinetic" }] } })] },
    { role: "assistant", content: "Exported." },
    { role: "assistant", content: "Storyboard complete: 1 scene, Anime.js." }
  ];

  // Positive: director → caster → writer → exporter end to end.
  downloads.length = 0;
  const logBeforeLlm = registry["log"].children.length;
  queueModel(llmScript.slice());
  let llmResult = null, llmErr = null;
  try { llmResult = await R.run(director, oneScene, LLM_SETTINGS, { critic: false }); } catch (e) { llmErr = e; }
  check("LLM mode: director→caster→writer→exporter completes",
    !llmErr && llmResult && /Storyboard complete/.test(llmResult.answer || ""),
    llmErr && (llmErr.code + ": " + llmErr.message));
  check("LLM mode: storyboard exported with 1 scene",
    downloads.some(d => d.name === "director-storyboard.json" &&
      d.content && JSON.parse(d.content).scenes.length === 1));
  check("LLM mode: run() returns scenes for the UI",
    llmResult && Array.isArray(llmResult.scenes) && llmResult.scenes.length === 1 &&
    llmResult.scenes[0].library === "Anime.js");
  check("LLM mode: delegation logged for caster/writer/exporter",
    ["caster", "kinetic_writer", "exporter"].every(a =>
      registry["log"].children.slice(logBeforeLlm)
        .some(c => (c.innerHTML || "").includes("delegating to agent " + a))));

  // Sub-agent return format, via the _delegate test hook.
  queueModel([
    { role: "assistant", content: "", tool_calls: [tc("d1", "website_cast_scene", { scene: oneScene, index: 0 })] },
    { role: "assistant", content: "Cast done." }
  ]);
  let delOut = null, delErr = null;
  try { delOut = await R._delegate(director, "caster", { scene: oneScene, index: 0 }, LLM_SETTINGS, 0); } catch (e) { delErr = e; }
  let delParsed = null;
  try { delParsed = JSON.parse(delOut || ""); } catch (e) {}
  check("sub-agent returns {ok:true, agent, payload} JSON string",
    !delErr && delParsed && delParsed.ok === true && delParsed.agent === "caster" &&
    delParsed.payload && delParsed.payload.library === "Anime.js",
    delErr ? (delErr.code + ": " + delErr.message) : delOut);

  // Depth limit: delegating at depth 3 throws delegate_depth.
  let depthErr = null;
  try { await R._delegate(director, "caster", { scene: "x" }, LLM_SETTINGS, 3); } catch (e) { depthErr = e; }
  check("delegation at depth 3 throws delegate_depth",
    depthErr && depthErr.code === "delegate_depth" &&
    /delegation depth exceeded 3/.test(depthErr.message),
    depthErr && (depthErr.code + ": " + depthErr.message));

  // Negative: a site action throwing inside a sub-agent fails the whole run.
  const baseActions = sandbox.DirectorActions.__original || sandbox.DirectorActions;
  const savedRender = baseActions.website_render_scene;
  baseActions.website_render_scene = async () => { throw new Error("render failed: canvas unavailable"); };
  downloads.length = 0;
  queueModel(llmScript.slice());
  let negErr = null;
  try { await R.run(director, oneScene, LLM_SETTINGS, { critic: false }); } catch (e) { negErr = e; }
  baseActions.website_render_scene = savedRender;
  check("LLM mode: site-action throw inside a sub-agent fails the whole run",
    negErr && /render failed/.test(negErr.message), negErr && negErr.message);
  check("LLM mode: failed run produces no partial storyboard download",
    !downloads.some(d => d.name === "director-storyboard.json"));

  // Permission: caster may not delegate to another agent...
  queueModel([
    { role: "assistant", content: "", tool_calls: [tc("p1", "caster", { scene: oneScene, index: 0 })] },
    { role: "assistant", content: "", tool_calls: [tc("p2", "particle_writer", { scene: oneScene, index: 0 })] }
  ]);
  let permErr = null;
  try { await R.run(director, oneScene, LLM_SETTINGS, { critic: false }); } catch (e) { permErr = e; }
  check("LLM mode: caster calling particle_writer throws a permission error",
    permErr && permErr.code === "permission_denied" &&
    /may not delegate to particle_writer/.test(permErr.message),
    permErr && (permErr.code + ": " + permErr.message));
  // ...and may not call a site action outside its declared tools.
  queueModel([
    { role: "assistant", content: "", tool_calls: [tc("p3", "caster", { scene: oneScene, index: 0 })] },
    { role: "assistant", content: "", tool_calls: [tc("p4", "website_render_scene", { scene: oneScene, kind: "kinetic", index: 0 })] }
  ]);
  let permErr2 = null;
  try { await R.run(director, oneScene, LLM_SETTINGS, { critic: false }); } catch (e) { permErr2 = e; }
  check("LLM mode: caster calling website_render_scene throws a permission error",
    permErr2 && permErr2.code === "permission_denied" &&
    /may not call website_render_scene/.test(permErr2.message),
    permErr2 && (permErr2.code + ": " + permErr2.message));

  // Static cycle detection.
  const cyclic = JSON.parse(JSON.stringify(director));
  cyclic.tools.find(a => a.name === "caster").tools = ["director"];
  let cycErr = null;
  try { R.validateNetwork(cyclic); } catch (e) { cycErr = e; }
  check("validateNetwork rejects a delegation cycle (caster→director)",
    cycErr && cycErr.code === "schema_violation" && /cycle/i.test(cycErr.message),
    cycErr && (cycErr.code + ": " + cycErr.message));

  // Manifest links field: peer loading fetches the manifest first, then the
  // links file it names (not a hardcoded path).
  fetchLog.length = 0;
  await R.run(director, oneScene, null, { critic: true, onConsent: async () => true });
  const mi = fetchLog.findIndex(u => u.includes("agent-manifest.json"));
  const li = fetchLog.findIndex(u => u.includes("links.json"));
  check("peer loading reads the manifest links field (manifest fetched before links.json)",
    mi !== -1 && li !== -1 && mi < li, JSON.stringify(fetchLog));

  // Over-budget: a model that delegates forever hits the shared 30-call cap.
  let modelCalls = 0;
  modelHandler = async (url, init) => {
    modelCalls++;
    let sys = "";
    try { sys = JSON.parse(init.body).messages[0].content || ""; } catch (e) {}
    const n = modelCalls;
    if (/You are the Caster/.test(sys)) {
      if (n % 3 === 2)
        return { role: "assistant", content: "", tool_calls: [tc("m" + n, "website_cast_scene", { scene: "Scene " + n, index: 0 })] };
      return { role: "assistant", content: "Cast done." };
    }
    return { role: "assistant", content: "", tool_calls: [tc("m" + n, "caster", { scene: "Scene " + n, index: 0 })] };
  };
  let budgetErr = null;
  try { await R.run(director, oneScene, LLM_SETTINGS, { critic: false }); } catch (e) { budgetErr = e; }
  check("LLM mode: endless delegation fails closed over 30 calls (budget_exceeded)",
    budgetErr && budgetErr.code === "budget_exceeded" &&
    /more than 30 tool calls/.test(budgetErr.message),
    budgetErr && (budgetErr.code + ": " + budgetErr.message));

  console.log("\n==== " + pass + " passed, " + fail + " failed ====");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(2); });
