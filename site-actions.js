// Director Network — grounded site actions.
// These are the capabilities the agent network can call. They run the same
// deterministic casting engine proven in the SLAY HACKS demo (classifier
// verified 12/12). No LLM call, no network request, no money spent.
(function () {
  "use strict";

  var LIBS = {
    kinetic: { name: "Anime.js", tag: "kinetic type",
      why: "This scene is words. Anime.js is built for kinetic type — staggered words and emphasis on the key phrase.",
      not: "Remotion would be overkill for a live web preview, and Manim is for maths, not headlines." },
    diagram: { name: "Motion Canvas", tag: "diagram engine",
      why: "This scene is data. Motion Canvas is built for code-driven diagram and explainer animation — bars, lines and labels that animate from the numbers themselves.",
      not: "A static chart would not move, and a video render would take minutes for a live preview." },
    formula: { name: "Manim", tag: "maths explainer",
      why: "A formula needs to be written, transformed and read step by step. Manim (community edition) is the tool built exactly for that — maths first, decoration second.",
      not: "Anime.js cannot typeset a proof, and Three.js is for space, not symbols." },
    orbit: { name: "Three.js", tag: "light 3D scene",
      why: "This scene is spatial — orbits, rotation, depth. Three.js is the light choice for a custom 3D scene on the web; no full game engine is needed.",
      not: "A 2D canvas cannot show depth, and Babylon.js would be heavier than this scene needs." },
    particles: { name: "Proton", tag: "particle engine",
      why: "This scene is energy, not information. Proton is a 2D particle engine — bursts, trails and fields — and it stays inside the page instead of needing a video render.",
      not: "A diagram engine would flatten the energy into bars, which is the wrong feeling." }
  };

  var SIGNALS = {
    diagram: ["data", "percent", "%", "chart", "bar", "growth", "increase", "decrease", "numbers", "survey", "results", "compare"],
    formula: ["formula", "equation", "=", "theorem", "proof", "derivative", "integral", "sqrt", "pi", "calculate"],
    orbit: ["orbit", "planet", "space", "rotate", "rotation", "3d", "sphere", "galaxy", "spin", "earth", "moon"],
    // NOTE: "launch" is deliberately NOT a particles signal. A bare "launch"
    // is usually a product launch (a headline → kinetic type); a particle
    // burst needs a second energy signal such as light / celebration / burst.
    particles: ["burst", "explode", "celebrat", "firework", "energy", "light", "spark", "blast"]
  };

  function classify(text) {
    var lower = " " + text.toLowerCase() + " ";
    var scores = { diagram: 0, formula: 0, orbit: 0, particles: 0, kinetic: 0 };
    Object.keys(SIGNALS).forEach(function (k) {
      SIGNALS[k].forEach(function (w) {
        if (lower.indexOf(w) !== -1) scores[k] += 1;
      });
    });
    var PRIORITY = ["formula", "diagram", "particles", "orbit", "kinetic"];
    var top = Math.max(scores.diagram, scores.formula, scores.orbit, scores.particles);
    var best = "kinetic";
    if (top >= 1) {
      var contenders = Object.keys(scores).filter(function (k) {
        return k !== "kinetic" && scores[k] >= 1 && scores[k] >= top - 1;
      });
      best = PRIORITY.find(function (k) { return contenders.indexOf(k) !== -1; }) || "kinetic";
    }
    var signals = [];
    Object.keys(SIGNALS).forEach(function (k) {
      SIGNALS[k].forEach(function (w) {
        if (lower.indexOf(w) !== -1) signals.push(w);
      });
    });
    return { kind: best, library: LIBS[best].name, reason: LIBS[best].why,
      rejected: LIBS[best].not, signals: signals.slice(0, 6) };
  }

  function drawScene(canvas, scene, kind, t) {
    var ctx = canvas.getContext("2d");
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0d1117"; ctx.fillRect(0, 0, W, H);
    var words = scene.text.split(/\s+/).slice(0, 12);
    if (kind === "diagram") {
      var vals = [0.3, 0.55, 0.4, 0.8, 0.65];
      vals.forEach(function (v, i) {
        var h = v * H * 0.55 * (0.5 + 0.5 * Math.min(1, t));
        ctx.fillStyle = ["#6ec3ff", "#c8f542", "#ffb454", "#8b7cff", "#ff7ab8"][i];
        ctx.fillRect(60 + i * 90, H - 60 - h, 56, h);
      });
      ctx.fillStyle = "#e6edf3"; ctx.font = "16px sans-serif";
      ctx.fillText("Motion Canvas — diagram from your numbers", 40, 40);
    } else if (kind === "formula") {
      ctx.strokeStyle = "#ffb454"; ctx.lineWidth = 3; ctx.beginPath();
      for (var x = 0; x <= W - 80; x += 4) {
        var y = H / 2 - Math.sin((x / W) * Math.PI * 2) * 60 * Math.min(1, t + 0.2);
        if (x === 0) ctx.moveTo(40 + x, y); else ctx.lineTo(40 + x, y);
      }
      ctx.stroke();
      ctx.fillStyle = "#e6edf3"; ctx.font = "20px sans-serif";
      ctx.fillText("Manim — " + scene.text.slice(0, 48), 40, 40);
    } else if (kind === "orbit") {
      ctx.strokeStyle = "#8b7cff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 90, 0, Math.PI * 2); ctx.stroke();
      var a = t * Math.PI * 2;
      ctx.fillStyle = "#c8f542"; ctx.beginPath();
      ctx.arc(W / 2 + Math.cos(a) * 90, H / 2 + Math.sin(a) * 90, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffb454"; ctx.beginPath(); ctx.arc(W / 2, H / 2, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e6edf3"; ctx.font = "16px sans-serif";
      ctx.fillText("Three.js — orbit", 40, 40);
    } else if (kind === "particles") {
      for (var i = 0; i < 60; i++) {
        var px = W / 2 + Math.cos(i * 2.4) * (t * 160 + (i % 7) * 8);
        var py = H / 2 + Math.sin(i * 2.4) * (t * 120 + (i % 5) * 8);
        ctx.fillStyle = ["#ff7ab8", "#c8f542", "#6ec3ff"][i % 3];
        ctx.beginPath(); ctx.arc(px, py, 3 + (i % 3), 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "#e6edf3"; ctx.font = "16px sans-serif";
      ctx.fillText("Proton — particle burst", 40, 40);
    } else {
      ctx.fillStyle = "#c8f542"; ctx.font = "bold 30px sans-serif";
      var shown = words.slice(0, Math.max(1, Math.floor(words.length * Math.min(1, t + 0.2))));
      ctx.fillText(shown.join(" "), 40, H / 2, W - 80);
      ctx.fillStyle = "#e6edf3"; ctx.font = "16px sans-serif";
      ctx.fillText("Anime.js — kinetic type", 40, 40);
    }
  }

  var lastStoryboard = null;

  window.DirectorActions = {
    website_cast_scene: async function (args) {
      var c = classify(args.scene || "");
      return { kind: c.kind, library: c.library, reason: c.reason,
        rejected: c.rejected, signals: c.signals };
    },
    website_render_scene: async function (args) {
      var canvas = document.getElementById("stage");
      if (canvas) drawScene(canvas, { text: args.scene || "" }, args.kind || "kinetic", 1);
      return { receipt: "rendered scene " + (args.index + 1) + " as " + (args.kind || "kinetic") +
        " on the stage canvas", kind: args.kind };
    },
    website_export_storyboard: async function (args) {
      lastStoryboard = args.storyboard || null;
      var blob = new Blob([JSON.stringify(lastStoryboard, null, 2)],
        { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "director-storyboard.json";
      a.click();
      return { file: "director-storyboard.json",
        scenes: (lastStoryboard && lastStoryboard.scenes.length) || 0 };
    },
    classify: classify,
    drawScene: drawScene
  };
})();
