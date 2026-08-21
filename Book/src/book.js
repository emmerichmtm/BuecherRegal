/* ==========================================================================
   The Riesz Companion — book engine
   pagination · page-turning · marker, pencil & notes · local persistence
   ========================================================================== */
(function () {
"use strict";

/* ---------- geometry (must agree with the CSS) ---------- */
var PW = 620, PH = 830;
var PAD_OUT = 58, PAD_IN = 70, PAD_TOP = 58, PAD_BOT = 66;
var CONTENT_W = PW - PAD_OUT - PAD_IN;      /* 492 */
var CONTENT_H = PH - PAD_TOP - PAD_BOT;     /* 706 */
var SPREAD_W = PW * 2;
var FLIP_MS = 790;
/* room a chapter heading needs to start on the current page;
   raise it to CONTENT_H (706) to force every chapter onto a fresh page */
var CHAPTER_BREAK = 250;
var STORE_KEY = "riesz-companion-book-v1";

var HL_COLORS  = ["#ffd83d", "#8ff08a", "#8fd6ff", "#ff9fd0", "#ffab5e"];
var PEN_COLORS = ["#1f3f8f", "#8f2318", "#1c1a17", "#126b4a", "#6a3fa0"];

/* ---------- element handles ---------- */
var $  = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var book = $("#book"), stage = $("#stage"), scaler = $("#scaler"), fitbox = $("#fitbox");
var srcEl = $("#source"), host = $("#pagesHost");
var slider = $("#slider"), pageLabel = $("#pageLabel");

/* ---------- state ---------- */
var pages = [];        /* {content, full, chapter} */
var leafEls = [];
var leafCount = 0;
var turned = 0;
var animating = false;
var chapters = [];     /* {num,title,page,sub:bool} */
var tool = "read";
var hlColor = HL_COLORS[0], penColor = PEN_COLORS[0];
var spreadMode = true, spreadPref = null, singleSide = "R";
var userZoom = 1, fitScale = 1;
var mounted = {};
var data = { strokes: {}, notes: {}, meta: {} };
var history = [];
var noteSeq = 1;
var DPR = Math.min(2, window.devicePixelRatio || 1);
var hlAlpha = 0.42;
var theme = "day", themeExplicit = false;
var ready = false;

/* ==========================================================================
   1.  prepare the source, typeset the mathematics
   ========================================================================== */
function decorateSource() {
  $$("#source > h1").forEach(function (h) {
    var num = h.getAttribute("data-num") || "";
    var isApp = h.hasAttribute("data-appendix");
    h.setAttribute("data-title", (h.textContent || "").trim());
    h.className = "chapter";
    var tag = document.createElement("span");
    tag.className = "hnum";
    tag.textContent = num;
    h.insertBefore(tag, h.firstChild);
  });
}

function typeset() {
  if (!window.renderMathInElement) return;
  window.renderMathInElement(srcEl, {
    delimiters: [
      { left: "\\[", right: "\\]", display: true },
      { left: "$$", right: "$$", display: true },
      { left: "\\(", right: "\\)", display: false }
    ],
    ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option", "svg"],
    throwOnError: false,
    macros: {
      "\\R": "\\mathbb{R}", "\\Q": "\\mathbb{Q}",
      "\\abs": "\\lvert #1 \\rvert", "\\norm": "\\lVert #1 \\rVert"
    }
  });
}

/* ==========================================================================
   2.  pagination
   ========================================================================== */
function stagePage(full) {
  var d = document.createElement("div");
  d.className = "page-content" + (full ? " full" : "");
  d.style.cssText = "position:relative;left:auto;top:auto;bottom:auto;height:auto;" +
                    "overflow:visible;width:" + CONTENT_W + "px;";
  host.appendChild(d);
  pages.push({ content: d, full: !!full, chapter: currentChapter });
  return d;
}

var currentChapter = "";

function fits(pageEl) { return pageEl.scrollHeight <= CONTENT_H + 1; }

function paginate() {
  var cur = null;
  var kids = Array.prototype.slice.call(srcEl.children);

  function openPage() { cur = stagePage(false); }
  function room() { return CONTENT_H - cur.scrollHeight; }

  kids.forEach(function (el) {
    /* dedicated full-bleed pages (cover, abstract, glossary, contents) */
    if (el.hasAttribute("data-nopaginate")) {
      stagePage(true).appendChild(el);
      cur = null;
      return;
    }

    /* a chapter flows on where there is room, and starts a fresh page where there is not */
    if (el.tagName === "H1") {
      if (!cur || cur.children.length === 0 || room() < CHAPTER_BREAK) openPage();
      cur.appendChild(el);
      return;
    }

    if (!cur) openPage();

    /* don't strand a subheading at the foot of a page */
    if (el.tagName === "H2" && cur.children.length && room() < 170) openPage();

    cur.appendChild(el);
    if (fits(cur)) return;

    /* --- it did not fit --- */
    cur.removeChild(el);

    /* long lists may be split item by item */
    if ((el.tagName === "OL" || el.tagName === "UL") && el.children.length > 1) {
      splitList(el, function () { openPage(); return cur; }, function () { return cur; });
      return;
    }

    /* Whatever this block belongs with travels over the break too: a heading
       sitting immediately above it, or the sentence introducing a display. */
    var carried = [];
    var last = cur.lastElementChild;
    if (cur.children.length > 1 && last) {
      if (last.tagName === "H1" || last.tagName === "H2") {
        carried = [last];
      } else if (el.classList.contains("eq") && last.tagName === "P" &&
                 !last.classList.contains("opening")) {
        carried = [last];
        var above = last.previousElementSibling;
        if (above && (above.tagName === "H1" || above.tagName === "H2") &&
            cur.children.length > 2) {
          carried.unshift(above);
        }
      }
    }
    carried.forEach(function (n) { cur.removeChild(n); });
    if (cur.children.length === 0) {          /* carrying would blank the page */
      carried.forEach(function (n) { cur.appendChild(n); });
      carried = [];
    }

    if (cur.children.length === 0) {          /* a single oversized block: let it ride */
      cur.appendChild(el);
      openPage();
      return;
    }

    openPage();
    carried.forEach(function (n) { cur.appendChild(n); });
    cur.appendChild(el);

    /* if the carried company makes the new page overflow, give it back */
    if (!fits(cur) && carried.length) {
      var prev = pages[pages.length - 2].content;
      cur.removeChild(el);
      carried.forEach(function (n) { prev.appendChild(n); });
      cur.appendChild(el);
    }
  });

  labelPages();
  indexChapters();
}

/* Running heads and chapter starts are read off the finished pages, so that
   anything carried across a break is still labelled correctly. */
function labelPages() {
  var name = "";
  pages.forEach(function (rec) {
    var h = rec.content.querySelector("h1.chapter");
    if (h) {
      name = h.getAttribute("data-title") || name;
      rec.opensChapter = (rec.content.firstElementChild === h);
    } else {
      rec.opensChapter = false;
    }
    rec.chapter = name;
  });
}

function indexChapters() {
  chapters = [];
  pages.forEach(function (rec, i) {
    $$("h1.chapter, h2:not(.fm-head)", rec.content).forEach(function (h) {
      if (h.tagName === "H1") {
        chapters.push({
          num: h.getAttribute("data-num"),
          appendix: h.hasAttribute("data-appendix"),
          title: h.getAttribute("data-title") || h.textContent.trim(),
          page: i, sub: false
        });
      } else {
        chapters.push({ title: h.textContent.trim(), page: i, sub: true });
      }
    });
  });
}

function splitList(list, makeNew, getCur) {
  var tag = list.tagName;
  var items = Array.prototype.slice.call(list.children);
  var counter = parseInt(list.getAttribute("start") || "1", 10);
  var cur = getCur();
  var holder = list.cloneNode(false);
  holder.setAttribute("start", counter);
  cur.appendChild(holder);

  items.forEach(function (li) {
    holder.appendChild(li);
    if (cur.scrollHeight > CONTENT_H + 1) {
      if (holder.children.length === 1) {
        if (cur.children.length > 1) {   /* page holds other content: restart the list on a fresh page */
          cur.removeChild(holder);
          cur = makeNew();
          cur.appendChild(holder);
        }
        counter++;
        return;                          /* a truly oversized single item rides on its own page */
      }
      holder.removeChild(li);
      cur = makeNew();
      holder = list.cloneNode(false);
      holder.setAttribute("start", counter);
      cur.appendChild(holder);
      holder.appendChild(li);
    }
    counter++;
  });
}

/* ==========================================================================
   3.  build the physical book
   ========================================================================== */
function buildLeaves() {
  if (pages.length % 2 === 1) stagePage(false);           /* a blank leaf-back */
  leafCount = pages.length / 2;

  for (var i = 0; i < leafCount; i++) {
    var leaf = document.createElement("div");
    leaf.className = "leaf";
    leaf.appendChild(makeFace(2 * i, "front"));
    leaf.appendChild(makeFace(2 * i + 1, "back"));
    book.appendChild(leaf);
    leafEls.push(leaf);
  }
  applyZ();
}

function makeFace(idx, side) {
  var f = document.createElement("div");
  f.className = "face " + side;
  f.dataset.page = idx;

  var hl = document.createElement("div"); hl.className = "hl-layer";
  var ink = document.createElement("div"); ink.className = "ink-layer";
  var notes = document.createElement("div"); notes.className = "notes-layer";
  f.appendChild(hl);

  var rec = pages[idx];
  if (rec) {
    var c = rec.content;
    c.style.cssText = "";                                  /* hand back to the stylesheet */
    f.appendChild(c);
    if (!rec.full) {
      if (!rec.opensChapter) {
        var run = document.createElement("div");
        run.className = "running";
        run.textContent = (side === "back")
          ? "A Learning Companion · Riesz s = 2"
          : (rec.chapter || "");
        f.appendChild(run);
      }
      var fol = document.createElement("div");
      fol.className = "folio";
      fol.innerHTML = "<i>·</i>" + (idx + 1) + "<i>·</i>";
      f.appendChild(fol);
    }
  } else {
    var blank = document.createElement("div");
    blank.className = "page-content";
    f.appendChild(blank);
  }

  f.appendChild(ink);
  f.appendChild(notes);

  var shade = document.createElement("div"); shade.className = "flipshade";
  f.appendChild(shade);

  var zone = document.createElement("div");
  zone.className = "turnzone " + (side === "front" ? "next" : "prev");
  zone.addEventListener("click", function (e) {
    e.stopPropagation();
    turn(side === "front" ? 1 : -1);
  });
  f.appendChild(zone);
  return f;
}

function applyZ() {
  for (var i = 0; i < leafCount; i++) {
    leafEls[i].style.zIndex = (i < turned) ? (1 + i) : (leafCount * 2 + 4 - i);
  }
}

/* ==========================================================================
   4.  navigation
   ========================================================================== */
function turn(dir) {
  if (animating) return;
  if (!spreadMode) { return singleStep(dir); }
  rawTurn(dir);
}

function rawTurn(dir) {
  var el;
  if (dir > 0) {
    if (turned >= leafCount) return false;
    el = leafEls[turned];
    el.style.zIndex = 9999;
    el.classList.add("turning", "flipped");
    turned++;
  } else {
    if (turned <= 0) return false;
    turned--;
    el = leafEls[turned];
    el.style.zIndex = 9999;
    el.classList.add("turning");
    el.classList.remove("flipped");
  }
  animating = true;
  mountRange(); updateChrome(); persistMeta();
  setTimeout(function () {
    el.classList.remove("turning");
    applyZ();
    animating = false;
  }, FLIP_MS + 20);
  return true;
}

function singleStep(dir) {
  if (dir > 0) {
    if (singleSide === "L") { singleSide = "R"; relayout(); updateChrome(); persistMeta(); return; }
    if (turned >= leafCount) return;
    if (rawTurn(1)) { singleSide = (turned === 0) ? "R" : "L"; relayout(); }
  } else {
    if (singleSide === "R") {
      if (turned === 0) return;
      singleSide = "L"; relayout(); updateChrome(); persistMeta(); return;
    }
    if (rawTurn(-1)) { singleSide = "R"; relayout(); }
  }
}

function gotoPage(p, instant) {
  p = Math.max(0, Math.min(pages.length - 1, p));
  var target = Math.ceil(p / 2);
  gotoLeaf(target, instant);
  if (!spreadMode) { singleSide = (p % 2 === 0) ? "R" : "L"; relayout(); }
}

function gotoLeaf(target, instant) {
  target = Math.max(0, Math.min(leafCount, target));
  if (target === turned) { updateChrome(); return; }
  if (!instant && Math.abs(target - turned) === 1) { rawTurn(target > turned ? 1 : -1); return; }

  leafEls.forEach(function (l) { l.classList.add("notrans"); });
  turned = target;
  leafEls.forEach(function (l, i) { l.classList.toggle("flipped", i < turned); });
  applyZ();
  void book.offsetWidth;
  requestAnimationFrame(function () {
    leafEls.forEach(function (l) { l.classList.remove("notrans"); });
  });
  mountRange(); updateChrome(); persistMeta();
}

function leftPage()  { return turned > 0 ? 2 * turned - 1 : -1; }
function rightPage() { return 2 * turned < pages.length ? 2 * turned : -1; }

function updateChrome() {
  slider.max = leafCount;
  slider.value = turned;
  var l = leftPage(), r = rightPage();
  var txt;
  if (!spreadMode) {
    var vis = (singleSide === "L") ? l : r;
    txt = vis === 0 ? "Cover" : (vis < 0 ? "—" : "Page " + (vis + 1) + " / " + pages.length);
  } else if (turned === 0) {
    txt = "Cover";
  } else if (r < 0) {
    txt = "Page " + (l + 1) + " / " + pages.length;
  } else {
    txt = "Pages " + (l + 1) + "–" + (r + 1) + " / " + pages.length;
  }
  pageLabel.textContent = txt;
}

/* ==========================================================================
   5.  layout & scaling
   ========================================================================== */
function relayout() {
  var availW = stage.clientWidth - 26;
  var availH = stage.clientHeight - 12;
  if (availW <= 0 || availH <= 0) return;

  var want = spreadPref === null ? (availW / (SPREAD_W + 26) > 0.52) : spreadPref;
  if (want !== spreadMode) {
    spreadMode = want;
    if (!spreadMode && turned === 0) singleSide = "R";
    $("#btnSpread").classList.toggle("on", !spreadMode);
  }

  var needW = spreadMode ? SPREAD_W : PW;
  fitScale = Math.min(availW / needW, availH / PH);
  fitScale = Math.min(fitScale, 1.45);
  var s = Math.max(0.12, fitScale * userZoom);

  var offset = 0;
  if (!spreadMode) offset = (singleSide === "L") ? 0 : PW;
  scaler.style.transform = "translateX(" + (-offset * s) + "px) scale(" + s + ")";
  fitbox.style.width = (needW * s) + "px";
  fitbox.style.height = (PH * s) + "px";
  fitbox.style.overflow = spreadMode ? "visible" : "hidden";
  book.style.perspectiveOrigin = spreadMode ? "50% 44%" : (singleSide === "L" ? "75% 44%" : "25% 44%");
}

/* ==========================================================================
   6.  annotation layers
   ========================================================================== */
function faceOf(idx) {
  return book.querySelector('.face[data-page="' + idx + '"]');
}

function mkCanvas(holder) {
  var c = document.createElement("canvas");
  c.width = Math.round(PW * DPR);
  c.height = Math.round(PH * DPR);
  c.style.width = PW + "px";
  c.style.height = PH + "px";
  c.style.display = "block";
  holder.appendChild(c);
  var ctx = c.getContext("2d");
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  return c;
}

function mountPage(idx) {
  if (mounted[idx]) return;
  var f = faceOf(idx);
  if (!f) return;
  var hlHolder = f.querySelector(".hl-layer"), inkHolder = f.querySelector(".ink-layer");
  var m = { hl: mkCanvas(hlHolder), ink: mkCanvas(inkHolder), notesEl: f.querySelector(".notes-layer") };
  mounted[idx] = m;
  redraw(idx);
  renderNotes(idx);
}

function unmountPage(idx) {
  var m = mounted[idx];
  if (!m) return;
  m.hl.width = m.hl.height = 0; m.hl.remove();
  m.ink.width = m.ink.height = 0; m.ink.remove();
  m.notesEl.innerHTML = "";
  delete mounted[idx];
}

function mountRange() {
  var lo = 2 * turned - 4, hi = 2 * turned + 5;
  for (var i = lo; i <= hi; i++) if (i >= 0 && i < pages.length) mountPage(i);
  Object.keys(mounted).forEach(function (k) {
    var i = +k;
    if (i < lo || i > hi) unmountPage(i);
  });
}

function ctxOf(idx, layer) {
  var m = mounted[idx];
  if (!m) return null;
  return (layer === "hl" ? m.hl : m.ink).getContext("2d");
}

function clearCtx(ctx) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, PW * DPR, PH * DPR);
  ctx.restore();
}

function withAlpha(hex, a) {
  var n = parseInt(hex.slice(1), 16);
  return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
}

function drawStroke(ctx, s) {
  var p = s.pts;
  if (!p || p.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = s.w;
  ctx.strokeStyle = (s.t === "h") ? withAlpha(s.c, hlAlpha) : s.c;
  if (s.t === "p") ctx.globalAlpha = 0.94;
  ctx.beginPath();
  if (p.length === 2) {
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(p[0] + 0.01, p[1] + 0.01);
  } else {
    ctx.moveTo(p[0], p[1]);
    for (var i = 2; i < p.length - 2; i += 2) {
      var mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2;
      ctx.quadraticCurveTo(p[i], p[i + 1], mx, my);
    }
    ctx.lineTo(p[p.length - 2], p[p.length - 1]);
  }
  ctx.stroke();
  ctx.restore();
}

function redraw(idx) {
  var m = mounted[idx];
  if (!m) return;
  var hc = m.hl.getContext("2d"), ic = m.ink.getContext("2d");
  clearCtx(hc); clearCtx(ic);
  (data.strokes[idx] || []).forEach(function (s) {
    drawStroke(s.t === "h" ? hc : ic, s);
  });
}

/* ---------- the live (in-progress) stroke ---------- */
var live = null, liveCanvas = null, liveCtx = null, drawing = null;

function ensureLive(face) {
  if (!liveCanvas) {
    liveCanvas = document.createElement("canvas");
    liveCanvas.width = Math.round(PW * DPR);
    liveCanvas.height = Math.round(PH * DPR);
    liveCanvas.style.cssText = "position:absolute;inset:0;width:" + PW + "px;height:" + PH +
                               "px;z-index:5;pointer-events:none";
    liveCtx = liveCanvas.getContext("2d");
  }
  liveCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  face.appendChild(liveCanvas);
}

function pointIn(face, e) {
  var r = face.getBoundingClientRect();
  var k = r.width / PW;
  return [(e.clientX - r.left) / k, (e.clientY - r.top) / k];
}

/* ==========================================================================
   7.  pointer handling
   ========================================================================== */
book.addEventListener("pointerdown", function (e) {
  if (tool === "read" || animating) return;
  var face = e.target.closest ? e.target.closest(".face") : null;
  if (!face || e.target.closest(".note")) return;
  var idx = +face.dataset.page;
  if (!mounted[idx]) mountPage(idx);
  var pt = pointIn(face, e);

  if (tool === "note") {
    addNote(idx, pt[0] - 86, pt[1] - 20);
    e.preventDefault();
    return;
  }

  if (tool === "erase") {
    drawing = { mode: "erase", idx: idx, face: face, hits: [] };
    eraseAt(idx, pt);
    try { face.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
    return;
  }

  var pr = (e.pressure && e.pressure > 0 && e.pointerType === "pen") ? e.pressure : 0.5;
  var s = (tool === "hl")
    ? { t: "h", c: hlColor, w: 17, pts: [pt[0], pt[1]] }
    : { t: "p", c: penColor, w: 1.5 + 2.0 * pr, pts: [pt[0], pt[1]] };
  drawing = { mode: "draw", idx: idx, face: face, s: s };
  ensureLive(face);
  try { face.setPointerCapture(e.pointerId); } catch (err) {}
  e.preventDefault();
});

book.addEventListener("pointermove", function (e) {
  if (!drawing) return;
  var pt = pointIn(drawing.face, e);
  if (drawing.mode === "erase") { eraseAt(drawing.idx, pt); return; }
  var p = drawing.s.pts;
  var dx = pt[0] - p[p.length - 2], dy = pt[1] - p[p.length - 1];
  if (dx * dx + dy * dy < 4) return;
  p.push(pt[0], pt[1]);
  clearCtx(liveCtx);
  drawStroke(liveCtx, drawing.s);
});

function endDraw() {
  if (!drawing) return;
  if (drawing.mode === "draw") {
    if (liveCtx) clearCtx(liveCtx);
    if (liveCanvas && liveCanvas.parentNode) liveCanvas.parentNode.removeChild(liveCanvas);
    var s = drawing.s;
    if (s.pts.length >= 2) {
      if (s.pts.length === 2) { s.pts.push(s.pts[0] + 0.6, s.pts[1] + 0.6); }
      (data.strokes[drawing.idx] = data.strokes[drawing.idx] || []).push(s);
      history.push({ op: "add", page: drawing.idx });
      var c = ctxOf(drawing.idx, s.t === "h" ? "hl" : "ink");
      if (c) drawStroke(c, s);
      save();
    }
  } else if (drawing.mode === "erase" && drawing.hits.length) {
    history.push({ op: "erase", page: drawing.idx, items: drawing.hits });
    save();
  }
  drawing = null;
}
book.addEventListener("pointerup", endDraw);
book.addEventListener("pointercancel", endDraw);
window.addEventListener("blur", endDraw);

function eraseAt(idx, pt) {
  var arr = data.strokes[idx];
  if (!arr || !arr.length) return;
  var R = 13, hit = false;
  for (var i = arr.length - 1; i >= 0; i--) {
    if (strokeNear(arr[i], pt, R + arr[i].w / 2)) {
      drawing.hits.push({ index: i, stroke: arr[i] });
      arr.splice(i, 1);
      hit = true;
    }
  }
  if (hit) redraw(idx);
}

function strokeNear(s, pt, R) {
  var p = s.pts, r2 = R * R;
  for (var i = 0; i < p.length - 2; i += 2) {
    if (segDist2(p[i], p[i + 1], p[i + 2], p[i + 3], pt[0], pt[1]) <= r2) return true;
  }
  return false;
}
function segDist2(x1, y1, x2, y2, px, py) {
  var dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
  var t = L ? ((px - x1) * dx + (py - y1) * dy) / L : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  var ux = x1 + t * dx - px, uy = y1 + t * dy - py;
  return ux * ux + uy * uy;
}

/* ==========================================================================
   8.  sticky notes
   ========================================================================== */
function addNote(idx, x, y) {
  x = Math.max(6, Math.min(PW - 178, x));
  y = Math.max(6, Math.min(PH - 100, y));
  var n = { id: "n" + (noteSeq++) + "_" + Math.floor(Math.random() * 1e6), x: x, y: y, text: "" };
  (data.notes[idx] = data.notes[idx] || []).push(n);
  history.push({ op: "note-add", page: idx, id: n.id });
  renderNotes(idx);
  save();
  var el = mounted[idx] && mounted[idx].notesEl.querySelector('[data-id="' + n.id + '"] .note-txt');
  if (el) el.focus();
}

function renderNotes(idx) {
  var m = mounted[idx];
  if (!m) return;
  m.notesEl.innerHTML = "";
  (data.notes[idx] || []).forEach(function (n) {
    var d = document.createElement("div");
    d.className = "note";
    d.dataset.id = n.id;
    d.style.left = n.x + "px";
    d.style.top = n.y + "px";
    d.style.transform = "rotate(" + (((hashStr(n.id) % 100) / 100 - 0.5) * 2.4).toFixed(2) + "deg)";
    d.innerHTML = '<div class="note-bar"><button class="note-del" title="Delete note">×</button></div>' +
                  '<div class="note-txt" contenteditable="true" spellcheck="false"></div>';
    var txt = d.querySelector(".note-txt");
    txt.textContent = n.text || "";
    txt.addEventListener("input", function () { n.text = txt.textContent; save(); });
    txt.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    d.querySelector(".note-del").addEventListener("click", function (e) {
      e.stopPropagation();
      var arr = data.notes[idx], i = arr.indexOf(n);
      if (i >= 0) {
        arr.splice(i, 1);
        history.push({ op: "note-del", page: idx, index: i, note: n });
        renderNotes(idx); save();
      }
    });
    dragNote(d, d.querySelector(".note-bar"), n, idx);
    m.notesEl.appendChild(d);
  });
}

function hashStr(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff;
  return h;
}

function dragNote(el, bar, n, idx) {
  bar.addEventListener("pointerdown", function (e) {
    e.stopPropagation(); e.preventDefault();
    var face = el.closest(".face");
    var start = pointIn(face, e), ox = n.x, oy = n.y;
    try { bar.setPointerCapture(e.pointerId); } catch (err) {}
    function mv(ev) {
      var p = pointIn(face, ev);
      n.x = Math.max(2, Math.min(PW - 176, ox + p[0] - start[0]));
      n.y = Math.max(2, Math.min(PH - 40, oy + p[1] - start[1]));
      el.style.left = n.x + "px"; el.style.top = n.y + "px";
    }
    function up() {
      bar.removeEventListener("pointermove", mv);
      bar.removeEventListener("pointerup", up);
      save();
    }
    bar.addEventListener("pointermove", mv);
    bar.addEventListener("pointerup", up);
  });
}

/* ==========================================================================
   9.  undo, clear, persistence
   ========================================================================== */
function undo() {
  var h = history.pop();
  if (!h) { toast("Nothing to undo"); return; }
  if (h.op === "add") {
    (data.strokes[h.page] || []).pop();
    redraw(h.page);
  } else if (h.op === "erase") {
    var arr = data.strokes[h.page] = data.strokes[h.page] || [];
    h.items.slice().reverse().forEach(function (it) { arr.splice(it.index, 0, it.stroke); });
    redraw(h.page);
  } else if (h.op === "note-add") {
    var a = data.notes[h.page] || [];
    for (var i = a.length - 1; i >= 0; i--) if (a[i].id === h.id) { a.splice(i, 1); break; }
    renderNotes(h.page);
  } else if (h.op === "note-del") {
    (data.notes[h.page] = data.notes[h.page] || []).splice(h.index, 0, h.note);
    renderNotes(h.page);
  } else if (h.op === "clear") {
    data.strokes[h.page] = h.strokes;
    data.notes[h.page] = h.notes;
    redraw(h.page); renderNotes(h.page);
  }
  gotoPage(h.page, true);
  save();
}

function clearSpread() {
  var list = spreadMode ? [leftPage(), rightPage()] : [singleSide === "L" ? leftPage() : rightPage()];
  var any = false;
  list.forEach(function (i) {
    if (i < 0) return;
    var s = data.strokes[i] || [], n = data.notes[i] || [];
    if (!s.length && !n.length) return;
    history.push({ op: "clear", page: i, strokes: s, notes: n });
    data.strokes[i] = []; data.notes[i] = [];
    redraw(i); renderNotes(i);
    any = true;
  });
  toast(any ? "Cleared" : "Nothing here to clear");
  if (any) save();
}

var saveT = null;
function save() {
  if (!ready) return;
  clearTimeout(saveT);
  saveT = setTimeout(function () {
    try {
      data.meta = { turned: turned, theme: theme, themeExplicit: themeExplicit,
                    pages: pages.length, side: singleSide };
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (err) { /* private mode, quota — carry on */ }
  }, 350);
}
function persistMeta() { save(); }

function load() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    var d = JSON.parse(raw);
    if (d && typeof d === "object") {
      data.strokes = d.strokes || {};
      data.notes = d.notes || {};
      data.meta = d.meta || {};
      return d.meta || {};
    }
  } catch (err) {}
  return null;
}

function countMarks() {
  var s = 0, n = 0;
  Object.keys(data.strokes).forEach(function (k) { s += (data.strokes[k] || []).length; });
  Object.keys(data.notes).forEach(function (k) { n += (data.notes[k] || []).length; });
  return { s: s, n: n };
}

/* ==========================================================================
   10.  contents
   ========================================================================== */
function buildToc() {
  var body = $("#tocBody"), list = $("#tocList");
  if (body) body.innerHTML = "";
  if (list) list.innerHTML = "";
  chapters.forEach(function (c) {
    if (body) {
      var row = document.createElement("div");
      row.className = "toc-row" + (c.sub ? " sub" : "");
      row.innerHTML = (c.sub ? '' : '<span class="toc-n">' + (c.appendix ? c.num : c.num) + '.</span>') +
                      '<span class="toc-t"></span><span class="toc-dots"></span>' +
                      '<span class="toc-p">' + (c.page + 1) + '</span>';
      row.querySelector(".toc-t").textContent = c.title;
      row.addEventListener("click", function () { gotoPage(c.page, true); });
      body.appendChild(row);
    }
    if (list) {
      var r2 = document.createElement("div");
      r2.className = "o-row";
      r2.style.paddingLeft = c.sub ? "16px" : "0";
      r2.style.fontSize = c.sub ? "12.5px" : "14px";
      r2.style.opacity = c.sub ? ".75" : "1";
      r2.innerHTML = (c.sub ? '' : '<span class="n">' + c.num + '.</span>') +
                     '<span class="t"></span><span class="d"></span><span class="p">' + (c.page + 1) + '</span>';
      r2.querySelector(".t").textContent = c.title;
      r2.addEventListener("click", function () {
        gotoPage(c.page, true);
        $("#tocOverlay").classList.remove("open");
      });
      list.appendChild(r2);
    }
  });
}

/* ==========================================================================
   11.  ui wiring
   ========================================================================== */
function setTool(t) {
  tool = t;
  $$("#tools .tbtn").forEach(function (b) { b.classList.toggle("on", b.dataset.tool === t); });
  document.body.classList.toggle("tool-active", t !== "read");
  ["cur-hl", "cur-pen", "cur-era", "cur-note"].forEach(function (c) { document.body.classList.remove(c); });
  if (t === "hl") document.body.classList.add("cur-hl");
  if (t === "pen") document.body.classList.add("cur-pen");
  if (t === "erase") document.body.classList.add("cur-era");
  if (t === "note") document.body.classList.add("cur-note");
  buildSwatches();
}

function buildSwatches() {
  var box = $("#swatches");
  box.innerHTML = "";
  var pal = tool === "hl" ? HL_COLORS : (tool === "pen" ? PEN_COLORS : null);
  if (!pal) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  pal.forEach(function (c) {
    var b = document.createElement("div");
    b.className = "sw" + (c === (tool === "hl" ? hlColor : penColor) ? " on" : "");
    b.style.background = (tool === "hl") ? withAlpha(c, 0.85) : c;
    b.title = c;
    b.addEventListener("click", function () {
      if (tool === "hl") hlColor = c; else penColor = c;
      buildSwatches();
    });
    box.appendChild(b);
  });
}

function hostPrefersDark() {
  var stamp = document.documentElement.getAttribute("data-theme");
  if (stamp === "dark") return true;
  if (stamp === "light") return false;
  return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

function setTheme(t, explicit) {
  theme = (t === "night") ? "night" : "day";
  if (explicit) themeExplicit = true;
  document.documentElement.classList.toggle("night", theme === "night");
  hlAlpha = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hl-alpha")) || 0.42;
  Object.keys(mounted).forEach(function (k) { redraw(+k); });
  save();
}

var toastT = null;
function toast(msg) {
  var t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(function () { t.classList.remove("show"); }, 1700);
}

function wire() {
  $$("#tools .tbtn").forEach(function (b) {
    b.addEventListener("click", function () { setTool(b.dataset.tool); });
  });
  $("#btnUndo").addEventListener("click", undo);
  $("#btnClear").addEventListener("click", clearSpread);
  $("#btnPrev").addEventListener("click", function () { turn(-1); });
  $("#btnNext").addEventListener("click", function () { turn(1); });
  $("#btnFirst").addEventListener("click", function () { gotoLeaf(0, true); singleSide = "R"; relayout(); });
  $("#btnLast").addEventListener("click", function () { gotoPage(pages.length - 1, true); });
  slider.addEventListener("input", function () { gotoLeaf(+slider.value, true); });

  $("#btnZoomIn").addEventListener("click", function () { userZoom = Math.min(2.4, userZoom * 1.15); relayout(); });
  $("#btnZoomOut").addEventListener("click", function () { userZoom = Math.max(0.5, userZoom / 1.15); relayout(); });
  $("#btnSpread").addEventListener("click", function () {
    spreadPref = spreadMode ? false : true;
    spreadMode = !spreadMode;
    $("#btnSpread").classList.toggle("on", !spreadMode);
    if (!spreadMode && turned === 0) singleSide = "R";
    relayout(); updateChrome();
  });
  $("#btnTheme").addEventListener("click", function () {
    setTheme(theme === "night" ? "day" : "night", true); return;
  });
  function fsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }
  function toggleFullscreen() {
    if (fsElement()) {
      (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
      return;
    }
    var root = document.documentElement;
    var req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!req) { toast("Full screen is not available here"); return; }
    var p = req.call(root);
    if (p && p.catch) p.catch(function () { toast("Full screen was blocked by the browser"); });
  }
  function fsSync() {
    var on = !!fsElement();
    $("#fsExpand").style.display = on ? "none" : "block";
    $("#fsShrink").style.display = on ? "block" : "none";
    $("#btnFull").title = on ? "Exit full screen (F)" : "Full screen (F)";
    relayout();
  }
  $("#btnFull").addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", fsSync);
  document.addEventListener("webkitfullscreenchange", fsSync);

  $("#btnToc").addEventListener("click", function () { $("#tocOverlay").classList.add("open"); });
  $("#btnMore").addEventListener("click", function () {
    var c = countMarks();
    $("#statLine").textContent = c.s + " stroke" + (c.s === 1 ? "" : "s") + " and " +
      c.n + " note" + (c.n === 1 ? "" : "s") + " saved across " + pages.length + " pages.";
    $("#moreOverlay").classList.add("open");
  });
  $$(".overlay").forEach(function (o) {
    o.addEventListener("click", function (e) {
      if (e.target === o || (e.target.dataset && e.target.dataset.close)) o.classList.remove("open");
    });
  });

  function copyText(payload) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(payload);
    }
    return Promise.reject();
  }

  function copyBackup(payload) {
    copyText(payload).then(
      function () { toast("Backup copied to the clipboard"); },
      function () { toast("Could not export — try again"); });
  }

  function saveViaLink(payload, name) {
    try {
      var blob = new Blob([payload], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    } catch (err) { copyBackup(payload); return; }
    copyText(payload).then(
      function () { toast("Backup saved and copied to the clipboard"); },
      function () { toast("Backup saved to your downloads"); });
  }

  $("#btnExport").addEventListener("click", function () {
    var payload = JSON.stringify({ strokes: data.strokes, notes: data.notes, meta: data.meta }, null, 1);
    var name = "riesz-companion-annotations.json";
    if (window.claude && typeof window.claude.use === "function") {
      window.claude.use("downloads").then(function (dl) {
        if (!dl) { copyBackup(payload); return; }
        dl.save({ filename: name, data: payload }).then(
          function () { toast("Backup saved"); },
          function (e) {
            if (e && e.code === "declined") toast("Save cancelled");
            else copyBackup(payload);
          });
      }, function () { copyBackup(payload); });
      return;
    }
    saveViaLink(payload, name);
  });
  $("#btnImport").addEventListener("click", function () { $("#fileIn").click(); });
  $("#fileIn").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(rd.result);
        data.strokes = d.strokes || {};
        data.notes = d.notes || {};
        history = [];
        Object.keys(mounted).forEach(function (k) { redraw(+k); renderNotes(+k); });
        save(); toast("Annotations restored");
        $("#moreOverlay").classList.remove("open");
      } catch (err) { toast("That file could not be read"); }
    };
    rd.readAsText(f);
    e.target.value = "";
  });
  $("#btnWipe").addEventListener("click", function () {
    if (!window.confirm("Delete every highlight, pencil mark and note in this book?")) return;
    data.strokes = {}; data.notes = {}; history = [];
    Object.keys(mounted).forEach(function (k) { redraw(+k); renderNotes(+k); });
    save(); toast("All annotations deleted");
    $("#moreOverlay").classList.remove("open");
  });

  /* click the middle of a page in read mode = turn forward / back */
  book.addEventListener("click", function (e) {
    if (tool !== "read") return;
    if (e.target.closest(".note") || e.target.closest(".turnzone")) return;
    if (window.getSelection && String(window.getSelection()).length > 2) return;
  });

  window.addEventListener("keydown", function (e) {
    var t = e.target;
    if (t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName))) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case "ArrowRight": case "PageDown": case " ": e.preventDefault(); turn(1); break;
      case "ArrowLeft": case "PageUp": e.preventDefault(); turn(-1); break;
      case "Home": e.preventDefault(); gotoLeaf(0, true); break;
      case "End": e.preventDefault(); gotoPage(pages.length - 1, true); break;
      case "Escape": $$(".overlay").forEach(function (o) { o.classList.remove("open"); }); setTool("read"); break;
      default:
        var k = e.key.toLowerCase();
        if (k === "r") setTool("read");
        else if (k === "h") setTool("hl");
        else if (k === "p") setTool("pen");
        else if (k === "n") setTool("note");
        else if (k === "e") setTool("erase");
        else if (k === "c") $("#tocOverlay").classList.toggle("open");
        else if (k === "d") setTheme(theme === "night" ? "day" : "night", true);
        else if (k === "f") toggleFullscreen();
    }
  });

  stage.addEventListener("wheel", function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    userZoom = Math.max(0.5, Math.min(2.4, userZoom * (e.deltaY < 0 ? 1.09 : 1 / 1.09)));
    relayout();
  }, { passive: false });

  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onMq = function () { if (!themeExplicit) setTheme(mq.matches ? "night" : "day"); };
    if (mq.addEventListener) mq.addEventListener("change", onMq);
    else if (mq.addListener) mq.addListener(onMq);
  }

  var rt = null;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(relayout, 90);
  });
}

/* ==========================================================================
   12.  boot
   ========================================================================== */
function boot() {
  var meta = load();
  themeExplicit = !!(meta && meta.themeExplicit);
  if (meta && meta.theme && meta.themeExplicit) setTheme(meta.theme);
  else setTheme(hostPrefersDark() ? "night" : "day");
  hlAlpha = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hl-alpha")) || 0.42;

  decorateSource();
  typeset();

  var go = function () {
    paginate();
    buildLeaves();
    buildToc();
    wire();
    setTool("read");

    if (meta && typeof meta.turned === "number" && meta.pages === pages.length) {
      turned = Math.max(0, Math.min(leafCount, meta.turned));
      leafEls.forEach(function (l, i) { l.classList.add("notrans"); l.classList.toggle("flipped", i < turned); });
      applyZ();
      requestAnimationFrame(function () {
        leafEls.forEach(function (l) { l.classList.remove("notrans"); });
      });
      if (meta.side) singleSide = meta.side;
    }

    relayout();
    mountRange();
    updateChrome();
    host.remove();
    srcEl.remove();
    ready = true;
    setTimeout(function () { $("#loader").classList.add("gone"); }, 120);
    setTimeout(function () { var l = $("#loader"); if (l) l.remove(); }, 900);
  };

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { setTimeout(go, 30); });
  } else {
    setTimeout(go, 300);
  }
}

/* ==========================================================================
   13.  print / annotated PDF
   Rebuilds the book as a flat stack of pages — content, highlight and pencil
   strokes, and sticky notes rendered in place — then opens the browser print
   dialog.  "Save as PDF" there produces the annotated PDF.
   ========================================================================== */
function annImg(idx, kind) {
  var c = document.createElement("canvas");
  c.width = PW * 2; c.height = PH * 2;
  var ctx = c.getContext("2d");
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  (data.strokes[idx] || []).forEach(function (s) {
    if ((kind === "hl") === (s.t === "h")) drawStroke(ctx, s);
  });
  var img = document.createElement("img");
  img.src = c.toDataURL("image/png");
  img.className = "ann-img";
  return img;
}

function buildPrintView() {
  removePrintView();
  var root = document.createElement("div");
  root.id = "printRoot";
  pages.forEach(function (rec, idx) {
    var f = faceOf(idx);
    if (!f) return;
    var pg = document.createElement("div");
    pg.className = "print-page";
    var fc = f.cloneNode(true);
    Array.prototype.slice.call(fc.querySelectorAll("canvas, .turnzone, .flipshade"))
      .forEach(function (n) { n.remove(); });
    var strokes = (data.strokes[idx] || []).length > 0;
    var hl = fc.querySelector(".hl-layer");
    var ink = fc.querySelector(".ink-layer");
    if (hl) { hl.innerHTML = ""; if (strokes) hl.appendChild(annImg(idx, "hl")); }
    if (ink) { ink.innerHTML = ""; if (strokes) ink.appendChild(annImg(idx, "ink")); }
    var nl = fc.querySelector(".notes-layer");
    if (nl) {
      nl.innerHTML = "";
      (data.notes[idx] || []).forEach(function (n) {
        var d = document.createElement("div");
        d.className = "note";
        d.style.left = n.x + "px"; d.style.top = n.y + "px";
        var t = document.createElement("div");
        t.className = "note-txt";
        t.textContent = n.text || "";
        d.appendChild(t); nl.appendChild(d);
      });
    }
    pg.appendChild(fc);
    root.appendChild(pg);
  });
  document.body.appendChild(root);
}

function removePrintView() {
  var r = document.getElementById("printRoot");
  if (r) r.remove();
}

function printBook() {
  buildPrintView();
  var imgs = Array.prototype.slice.call(document.querySelectorAll("#printRoot img.ann-img"));
  var pending = imgs.filter(function (im) { return !im.complete; }).length;
  var go = function () { window.print(); };
  if (pending === 0) { setTimeout(go, 60); return; }
  var done = 0;
  imgs.forEach(function (im) {
    if (im.complete) return;
    im.onload = im.onerror = function () { if (++done >= pending) setTimeout(go, 60); };
  });
  setTimeout(go, 1500);                      /* safety net */
}

var btnPrint = document.getElementById("btnPrint");
if (btnPrint) btnPrint.addEventListener("click", function () {
  document.querySelectorAll(".overlay").forEach(function (o) { o.classList.remove("open"); });
  printBook();
});
window.addEventListener("beforeprint", function () {
  if (!document.getElementById("printRoot")) buildPrintView();
});
window.addEventListener("afterprint", removePrintView);

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

})();
