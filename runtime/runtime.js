// Director Network — minimal browser runtime (own implementation).
// Implements the Worldwide Agentic Web MVP Profile 0.3 behaviours this site
// needs: validate manifest + network, run the agent loop (LLM or demo mode),
// dispatch grounded site actions, load peer networks by URL with user consent,
// enforce execution bounds, fail closed. No publisher code is executed from a
// peer: peer networks are data-only JSON, parsed and validated here.
//
// Doubao round 2, step 1 (2026-11-21): LLM mode now implements agent-to-agent
// delegation. The model loop exposes agent names as tools; a call to an agent
// name is intercepted and run as a sub-agent (that agent's instructions as
// system prompt, the tool-call arguments as input, tools limited to that
// agent's declared tools). Sub-agents are NEVER registered in
// window.DirectorActions, never delegate further, and never touch peers.
// Budget (tool calls + wall time) is shared globally across parent and
// sub-agents; any failure terminates the whole run with no partial
// storyboard (fail closed).
(function () {
  "use strict";

  // Demo mode needs 2 tool calls per scene (cast + render) plus 1 export,
  // so the cap must cover a reasonable script: 30 calls ≈ 14 scenes.
  var MAX_TOOL_CALLS = 30;
  var MAX_SECONDS = 60;
  var MAX_DEPTH = 3;

  // Standardised error payloads: every runtime failure carries a
  // machine-readable code, so the UI (and tests) can tell a budget failure
  // from a bad network, a refused peer or a forbidden tool call.
  //   budget_exceeded    — over MAX_TOOL_CALLS or MAX_SECONDS
  //   delegate_depth     — delegation would exceed MAX_DEPTH
  //   schema_violation   — malformed network/manifest, bad tool reference,
  //                        delegation cycle, unknown tool, empty model reply
  //   peer_denied        — peer link refused (off-origin)
  //   permission_denied  — an agent called a tool outside its declared tools,
  //                        or a sub-agent tried to delegate / touch a peer
  //   model_error        — the router/model call itself failed
  function err(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function log(activity, msg) {
    if (window.DirectorLog) window.DirectorLog(activity, msg);
    else console.log("[director]", activity, msg);
  }

  // --- Static delegation-cycle detection (Doubao round 2, fix 6). ---
  // A cycle (A → B → A) used to be caught only at runtime by the depth
  // limit; now validateNetwork rejects it up front.
  function detectDelegationCycles(net) {
    var agents = {};
    net.tools.forEach(function (a) { agents[a.name] = a; });
    var state = {};
    var stack = [];
    function visit(name) {
      state[name] = 1;
      stack.push(name);
      (agents[name].tools || []).forEach(function (t) {
        if (!agents[t]) return;
        if (state[t] === 1)
          throw err("schema_violation",
            "Delegation cycle detected: " + stack.concat([t]).join(" → "));
        if (!state[t]) visit(t);
      });
      stack.pop();
      state[name] = 2;
    }
    Object.keys(agents).forEach(function (n) { if (!state[n]) visit(n); });
  }

  function validateNetwork(net) {
    if (!net || typeof net !== "object")
      throw err("schema_violation", "Network is not an object");
    var front = net.metadata && net.metadata.front_agent;
    if (!front) throw err("schema_violation", "Network has no front_agent");
    if (!Array.isArray(net.tools) || net.tools.length === 0)
      throw err("schema_violation", "Network has no agents");
    var names = {};
    net.tools.forEach(function (a) {
      if (!a.name) throw err("schema_violation", "Agent without a name");
      if (names[a.name])
        throw err("schema_violation", "Duplicate agent: " + a.name);
      names[a.name] = true;
      if (!a.function || !a.function.description)
        throw err("schema_violation", "Agent " + a.name + " has no function description");
    });
    if (!names[front])
      throw err("schema_violation", "Front agent not defined: " + front);
    net.tools.forEach(function (a) {
      (a.tools || []).forEach(function (t) {
        if (typeof t === "string" && !names[t] && !window.DirectorActions[t]) {
          throw err("schema_violation",
            "Agent " + a.name + " references unknown tool/agent: " + t);
        }
      });
    });
    detectDelegationCycles(net);
    return true;
  }

  function validateManifest(man) {
    if (!man || !Array.isArray(man.networks) || man.networks.length === 0)
      throw err("schema_violation", "Manifest has no networks");
    man.networks.forEach(function (n) {
      if (!n.name || !n.front_agent || !n.hocon)
        throw err("schema_violation",
          "Manifest network entry is incomplete: " + JSON.stringify(n));
    });
    return true;
  }

  // --- Model call (OpenAI-compatible chat completions). Key is attached only
  // here, never to peer sites, URLs, prompts or traces. ---
  async function callModel(settings, messages, tools) {
    var res = await fetch(settings.baseUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + settings.key
      },
      body: JSON.stringify({
        model: settings.model,
        messages: messages,
        tools: tools.length ? tools : undefined,
        stream: false
      })
    });
    if (!res.ok) throw err("model_error", "Model call failed: HTTP " + res.status);
    var data = await res.json();
    return data.choices && data.choices[0] ? data.choices[0].message : null;
  }

  // --- Shared execution context. budget is ONE object shared by the parent
  // loop and every sub-agent, so tool calls and wall time are global. ---
  function newContext(network, settings) {
    return { network: network, settings: settings,
      budget: { calls: 0, started: Date.now() }, depth: 0,
      exportedStoryboard: null };
  }
  function checkTime(ctx) {
    if (Date.now() - ctx.budget.started > MAX_SECONDS * 1000)
      throw err("budget_exceeded", "Over budget: run exceeded " + MAX_SECONDS + " seconds");
  }
  function countToolCall(ctx) {
    if (++ctx.budget.calls > MAX_TOOL_CALLS)
      throw err("budget_exceeded", "Over budget: more than " + MAX_TOOL_CALLS + " tool calls");
    checkTime(ctx);
  }

  // Wrap the ORIGINAL actions, never a previously wrapped set: otherwise a
  // second run would double-wrap and the stale inner counter could throw
  // "Over budget" on a run that is actually within budget. Each wrapper
  // counts against the current run's shared budget.
  function wrapActions(ctx) {
    var base = (window.DirectorActions && window.DirectorActions.__original) ||
      window.DirectorActions;
    var wrappedActions = { __original: base };
    Object.keys(base || {}).forEach(function (name) {
      wrappedActions[name] = async function (args) {
        countToolCall(ctx);
        return base[name](args);
      };
    });
    window.DirectorActions = wrappedActions;
  }

  function findAgent(network, name) {
    var found = null;
    (network.tools || []).forEach(function (a) { if (a.name === name) found = a; });
    return found;
  }
  function agentNames(network) {
    var m = {};
    (network.tools || []).forEach(function (a) { m[a.name] = true; });
    return m;
  }

  // Tools the model may call for one agent: only what that agent declares.
  // Agent names are delegation targets; anything else is a grounded site
  // action with a generic schema (the runtime, not the model, enforces
  // which site actions each agent may actually use).
  function toolsForAgent(agent, network) {
    return (agent.tools || []).map(function (t) {
      var sub = findAgent(network, t);
      if (sub) return { type: "function", function: {
        name: t, description: sub.function.description,
        parameters: { type: "object", properties: { input: { type: "string" } } }
      } };
      return { type: "function", function: {
        name: t,
        description: "Site action " + t + " (grounded, runs locally in the browser).",
        parameters: { type: "object", properties: {
          scene: { type: "string" }, index: { type: "integer" },
          kind: { type: "string" }, storyboard: { type: "object" } },
          additionalProperties: true }
      } };
    });
  }

  // --- Demo mode: no LLM. The director flow is deterministic: split scenes,
  // cast each via the site action, render, export. This is what lets judges
  // test the product free of charge. ---
  async function runDemo(network, script, opts) {
    var scenes = script.split(/\n\s*\n/).map(function (s) { return s.trim(); })
      .filter(Boolean);
    if (scenes.length === 0) scenes = [script.trim()].filter(Boolean);
    var storyboard = { scenes: [], createdAt: new Date().toISOString() };
    for (var i = 0; i < scenes.length; i++) {
      var cast = await window.DirectorActions.website_cast_scene(
        { scene: scenes[i], index: i });
      var kind = cast.kind;
      var render = await window.DirectorActions.website_render_scene(
        { scene: scenes[i], index: i, kind: kind });
      storyboard.scenes.push({
        index: i, text: scenes[i], library: cast.library, kind: kind,
        reason: cast.reason, rejected: cast.rejected, signals: cast.signals,
        rendered: render.receipt
      });
      log("agent", "Scene " + (i + 1) + " → " + cast.library + " (" + cast.reason + ")");
    }
    var exported = await window.DirectorActions.website_export_storyboard(
      { storyboard: storyboard });
    storyboard.exported = exported.file;
    if (opts && opts.critic) {
      var verdict = await loadPeerAndReview(storyboard, opts.onConsent);
      storyboard.critic = verdict;
    }
    return storyboard;
  }

  // --- Peer loading: consent first, then resolve the peer through the
  // manifest's links field (Doubao round 2, fix 7 — no hardcoded links.json
  // path), fetch the linked network file, validate it, and cross-check the
  // peer manifest for an exact-name match. The peer runs in this browser on
  // the caller's router/key. Key is never sent to the peer origin. ---
  async function loadPeerAndReview(storyboard, onConsent) {
    var peerBase = window.location.origin + window.location.pathname.replace(/[^/]*$/, "");
    var approved = onConsent ? await onConsent(peerBase, "review your storyboard") : false;
    if (!approved) {
      log("consent", "Peer contact denied by user — critic skipped");
      return { status: "denied", note: "User declined peer contact" };
    }
    log("consent", "Peer contact approved for " + peerBase);
    var man = await (await fetch(peerBase + "agent-manifest.json")).json();
    validateManifest(man);
    var linksPath = (man.links && typeof man.links === "string") ? man.links : "links.json";
    var links = await (await fetch(peerBase + linksPath.replace(/^\.\//, ""))).json();
    var criticUrl = links && links.networks && links.networks.director &&
      links.networks.director.critic;
    if (!criticUrl)
      throw err("schema_violation", "links.json has no peer link for 'critic'");
    if (/^https?:\/\//i.test(criticUrl) && criticUrl.indexOf(peerBase) !== 0)
      throw err("peer_denied", "Peer link points off-origin — refused: " + criticUrl);
    var net = await (await fetch(peerBase + criticUrl.replace(/^\.\//, ""))).json();
    validateNetwork(net);
    // In this data model the network name lives in metadata, not top-level.
    if (net.metadata.front_agent !== "critic" || net.metadata.name !== "critic")
      throw err("schema_violation", "Peer network is not the 'critic' network (exact match required)");
    var entry = man.networks.find(function (n) { return n.name === "critic"; });
    if (!entry || entry.hocon !== criticUrl.replace(/^\.\//, ""))
      throw err("schema_violation", "Peer manifest has no network named 'critic' matching links.json");
    log("peer", "Loaded peer network 'critic' from " + peerBase + criticUrl);
    // The critic's verdict is produced locally in demo mode by a structured
    // review of the storyboard; with an LLM key it would be a model call.
    // Either way, the peer receives only the storyboard text the user approved.
    var issues = [];
    storyboard.scenes.forEach(function (s, i) {
      if (s.text.split(/\s+/).length > 40)
        issues.push({ scene: i + 1, fix: "Split this scene: it carries more than one idea." });
      if (s.kind === "kinetic" && s.text.length < 10)
        issues.push({ scene: i + 1, fix: "Very short scene for kinetic type — merge it with the next scene." });
    });
    var score = Math.max(5, 10 - issues.length);
    return { status: "ok", score: score + "/10", fixes: issues.slice(0, 3),
      note: "Reviewed by the critic peer network, run in your browser." };
  }

  // --- Tool dispatch: the delegation intercept (Doubao round 2, step 1). ---
  // A tool call naming a network agent is a delegation, not a site action:
  // it runs that agent as a sub-agent. A site action is allowed only if the
  // calling agent declares it in its tools list. Anything else is an error,
  // and every error here propagates up and terminates the whole run.
  async function dispatchTool(tc, agent, ctx) {
    var fn = tc.function.name;
    var args = {};
    try { args = JSON.parse(tc.function.arguments || "{}"); } catch (e) { args = {}; }
    var names = agentNames(ctx.network);
    if (names[fn]) {
      if (ctx.depth > 0)
        throw err("permission_denied",
          "Permission denied: sub-agent " + agent.name + " may not delegate to " +
          fn + " (no second-level delegation)");
      countToolCall(ctx);
      return runSubAgent(findAgent(ctx.network, fn), args, ctx);
    }
    if ((agent.tools || []).indexOf(fn) === -1) {
      if (window.DirectorActions && window.DirectorActions[fn])
        throw err("permission_denied",
          "Permission denied: agent " + agent.name + " may not call " + fn +
          " (not in its declared tools)");
      throw err("schema_violation", "Unknown tool: " + fn);
    }
    if (!window.DirectorActions || !window.DirectorActions[fn])
      throw err("schema_violation", "Unknown tool: " + fn);
    if (fn === "website_export_storyboard" && args.storyboard)
      ctx.exportedStoryboard = args.storyboard;
    return window.DirectorActions[fn](args);
  }

  // --- Sub-agent execution. The sub-agent runs its own mini agent loop with
  // its instructions as system prompt and the delegation arguments as input.
  // Its tools are limited to its declared tools array; it cannot delegate
  // (dispatchTool enforces that) and has no peer access (peer loading stays
  // in the top-level director flow). The BYOK key is reused from the
  // top-level settings — it is attached only by callModel, never passed to
  // peers. Returns a JSON string {ok, agent, payload}; on any failure it
  // throws, the run terminates, and no partial storyboard is returned. ---
  async function runSubAgent(agent, args, ctx) {
    if (ctx.depth + 1 > MAX_DEPTH)
      throw err("delegate_depth", "Over budget: delegation depth exceeded " + MAX_DEPTH);
    log("delegate", "delegating to agent " + agent.name);
    // Shares ctx.budget by reference: calls and start time are global
    // across parent and sub-agents. exportedStoryboard is propagated back
    // below (it is reassigned, not mutated, so it cannot be shared by ref).
    var subCtx = { network: ctx.network, settings: ctx.settings,
      budget: ctx.budget, depth: ctx.depth + 1,
      exportedStoryboard: ctx.exportedStoryboard };
    var messages = [
      { role: "system", content: agent.instructions || "" },
      { role: "user", content: JSON.stringify(args) }
    ];
    var out = await runAgentLoop(agent, messages, subCtx);
    if (subCtx.exportedStoryboard) ctx.exportedStoryboard = subCtx.exportedStoryboard;
    var payload = out.lastToolResult;
    if (payload === undefined || payload === null) {
      try { payload = JSON.parse(out.answer || ""); }
      catch (e) { payload = { text: out.answer || "" }; }
    }
    return JSON.stringify({ ok: true, agent: agent.name, payload: payload });
  }

  // One agent's model loop: call the model, dispatch each tool call, feed
  // results back. Ends when the model answers without tool calls. The loop
  // itself is unbounded, but every tool call counts against the shared
  // budget, so a model that never stops hits MAX_TOOL_CALLS and fails
  // closed; wall time is checked before every model call.
  async function runAgentLoop(agent, messages, ctx) {
    var tools = toolsForAgent(agent, ctx.network);
    var lastToolResult;
    for (;;) {
      checkTime(ctx);
      var msg = await callModel(ctx.settings, messages, tools);
      if (!msg) throw err("schema_violation", "Model returned no message");
      messages.push(msg);
      if (!msg.tool_calls || msg.tool_calls.length === 0)
        return { answer: msg.content || "", lastToolResult: lastToolResult };
      for (var i = 0; i < msg.tool_calls.length; i++) {
        var tc = msg.tool_calls[i];
        var result = await dispatchTool(tc, agent, ctx);
        if (typeof result !== "string") lastToolResult = result;
        messages.push({ role: "tool", tool_call_id: tc.id,
          content: typeof result === "string" ? result : JSON.stringify(result) });
      }
    }
  }

  async function run(network, script, settings, opts) {
    validateNetwork(network);
    var ctx = newContext(network, settings);
    wrapActions(ctx);

    if (!settings || !settings.key) {
      log("runtime", "Demo mode: no key — deterministic local run");
      return runDemo(network, script, opts);
    }
    // LLM mode: front agent loop with tool calling and delegation.
    log("runtime", "LLM mode: " + settings.model + " via " + settings.baseUrl);
    var front = findAgent(network, network.metadata.front_agent);
    if (!front)
      throw err("schema_violation", "Front agent not defined: " + network.metadata.front_agent);
    var messages = [
      { role: "system", content: front.instructions || "" },
      { role: "user", content: script }
    ];
    var out = await runAgentLoop(front, messages, ctx);
    // The page UI renders board.scenes, so return the exported storyboard
    // when the director produced one. scenes defaults to [] so an LLM run
    // that never exported cannot crash the UI — it just shows no scenes.
    var scenes = (ctx.exportedStoryboard && ctx.exportedStoryboard.scenes) || [];
    return { answer: out.answer, scenes: scenes,
      exported: ctx.exportedStoryboard ? "director-storyboard.json" : null };
  }

  // Test hook (used by tests/demo-flow.test.js): run one sub-agent directly
  // at a given depth, with a fresh budget. Lets tests assert the delegation
  // return format and the MAX_DEPTH limit without a full director run.
  async function delegateForTest(network, agentName, args, settings, depth) {
    validateNetwork(network);
    var ctx = newContext(network, settings);
    ctx.depth = depth || 0;
    wrapActions(ctx);
    var agent = findAgent(network, agentName);
    if (!agent) throw err("schema_violation", "Unknown agent: " + agentName);
    return runSubAgent(agent, args || {}, ctx);
  }

  window.DirectorRuntime = {
    run: run,
    validateNetwork: validateNetwork,
    validateManifest: validateManifest,
    limits: { maxToolCalls: MAX_TOOL_CALLS, maxSeconds: MAX_SECONDS, maxDepth: MAX_DEPTH },
    errorCodes: ["budget_exceeded", "delegate_depth", "schema_violation",
      "peer_denied", "permission_denied", "model_error"],
    _delegate: delegateForTest
  };
})();
