# Book factory — turn a publication into a page-turning book

This project converts academic papers into single-file HTML "books": fixed pages with 3D
page turns, KaTeX mathematics set in Computer Modern, and reader annotation (highlighter,
pencil, sticky notes) persisted in the browser. One finished example lives here — the
Riesz §5–6 learning companion. The owner wants **every one of their publications** turned
into a book like this, so treat this folder as the reusable engine plus one worked example.

Read `README.md` for the file layout, build commands, and pagination internals. This file
covers what a session converting a *new* paper must know.

## Making a book from a new paper

1. **Scaffold a new book folder** with `skills/make-book/scripts/new-book.sh` into
   `C:\MyTemp\code\BuecherRegal\Books\<AuthorSurname Year Title>\`. Everything is
   engine except `src/content.html` (the paper) and small identity strings listed below.
2. **Prefer LaTeX source** over PDF. For arXiv papers, the source is downloadable and far
   more faithful than PDF extraction. If only a PDF exists, extract and re-typeset, then
   proofread every formula — math from PDFs is where errors creep in (dropped primes,
   misread subscripts).
3. **Convert the content** into the block vocabulary in `README.md` ("Editing the
   content"), writing it to `src/content.html`. Keep the author's text verbatim; do not
   paraphrase. Front matter order: cover page, abstract, how-to page, optional notation
   page, TOC placeholder (`<div id="tocPage" data-nopaginate="1">…<div id="tocBody">` must
   exist — the engine fills it).
4. **Update the per-book identity strings:**
   - `src/shell.html`: `<title>`, the toolbar title (`tb-title`), and the cover markup
     lives in `src/content.html`.
   - `src/book.js`: `STORE_KEY` — **must be unique per book** (e.g.
     `"<slug>-book-v1"`), otherwise two books opened in the same browser will overwrite
     each other's annotations. Also the verso running head string
     (`"A Learning Companion · Riesz s = 2"`) and the export filename
     (`riesz-companion-annotations.json`).
   - `build.sh`: the default output filename.
5. **Build** with `bash build.sh` (Git Bash). Output is one self-contained HTML file.
6. **Verify** (see checklist below) before declaring done.

## Conversion rules that will bite you

These are restated from README.md because skipping them breaks the book silently:

- The typesetter recognizes only `\(...\)` inline and `\[...\]` / `$$...$$` display —
  **never single `$`**. Convert every `$...$` in the source to `\(...\)` during
  preparation; a missed one appears as raw dollar-sign LaTeX in the running text.
- Escape `<` as `&lt;` inside every math expression; a bare `<` starts an HTML tag.
- No LaTeX inside `<svg>` — the typesetter skips SVG. Use Unicode or `<tspan>` superscripts.
- Only `\R`, `\Q`, `\abs{}`, `\norm{}` macros exist. Port the paper's `\newcommand`s into
  the `macros` block in `src/book.js` (`typeset()` function) — do this before converting
  the body, not after formulas start failing.
- Equation numbers are manual `\tag{n}`; cross-references become literal "(n)" text.
- `\cite{}`/`\ref{}` have no resolver: write out references as fixed text; the
  bibliography becomes an ordinary chapter of paragraphs.
- Theorem-like environments → `<div class="lemma">`; exercises → `<div class="exercise">`.
- TikZ figures must be redrawn as inline SVG using the CSS variables
  (`var(--figline)`, `var(--fig-accent)` …) so they follow the day/night theme. Look at
  the four figures in the example `src/content.html` for the idiom.

## Engine invariants — do not change casually

- Page geometry: 620×830 px page, 492×706 px text block. The constants at the top of
  `src/book.js` (`PW/PH/PAD_*`) and the CSS (`--PW/--PH`, `.page-content` box) must agree.
- Chapters flow mid-page and break only when < `CHAPTER_BREAK` (250) px remain. The owner
  explicitly rejected one-chapter-per-page and "Chapter N" eyebrow labels — headings are a
  plain accent-colored number + title. Don't reintroduce either.
- Annotations are keyed by page number. Any content edit that changes pagination orphans
  existing marks — warn the owner to Export first.
- The built file must start with `<!doctype html>` (the default build does). The `--bare`
  build is only for publishing as a claude.ai artifact; opened directly it falls into
  quirks mode and KaTeX refuses to run.

## Verification checklist (run before saying "done")

Serve the folder (`tools/serve.pl` via Git Bash perl — see below) and check in a browser
with JavaScript. Screenshots may be unavailable; all of these are checkable
programmatically:

```js
// zero overflowing pages
[...document.querySelectorAll('.face .page-content')].filter(c => c.scrollHeight > c.clientHeight + 2)
// zero failed formulas
document.querySelectorAll('.katex-error').length
// no heading stranded at the foot of a page
[...document.querySelectorAll('.face h1.chapter, .face .page-content h2')]
  .filter(h => h.parentElement.lastElementChild === h)
// the contents page fits its page
(b => b.scrollHeight <= b.clientHeight + 1)(document.querySelector('#tocBody'))
// no display equation wider than the text block
[...document.querySelectorAll('.face .eq')].filter(e => e.scrollWidth > e.clientWidth + 1)
// no unconverted math: stray $ delimiters or raw backslash-LaTeX in the rendered text
[...document.querySelectorAll('.face .page-content')].map(c => c.innerText)
  .filter(t => /[$]|\\(frac|sum|sigma|lambda|begin)/.test(t)).length
```

Also flip a few pages, draw one highlighter and one pencil stroke, add a note, undo, and
reload to confirm persistence (`localStorage` under the book's `STORE_KEY`).

Serving for verification (the Claude Code preview needs `.claude/launch.json` in the CWD):

```json
{ "version": "0.0.1", "configurations": [ {
  "name": "book-preview",
  "runtimeExecutable": "C:/Program Files/Git/usr/bin/perl.exe",
  "runtimeArgs": ["<absolute path to>/tools/serve.pl"],
  "port": 8731 } ] }
```

`serve.pl` serves its own directory; copy the built book next to it or adjust paths.
Remove the launch.json again afterwards — the owner's repos shouldn't accumulate them.

## Environment notes (this machine)

- Windows 11; Git Bash provides bash/awk/perl. **There is no Node or real Python** — the
  `python` on PATH is the Microsoft Store stub and *hangs waiting for input*; never invoke
  it. Build tooling is bash+awk on purpose.
- MiKTeX is installed (`pdflatex`, `pdftoppm`) if a reference PDF render is needed.
- Deliver finished books by copying to the folder the owner names, and also publish as a
  claude.ai artifact (use the `--bare` build, declare the `downloads` capability — the
  in-book Export button already calls `claude.use("downloads")` when it exists).

## Owner preferences learned so far

- Chapters flow on; no per-chapter page breaks; no "Chapter N" labels (plain number+title).
- Books must work fully offline as a single file.
- The owner reads and annotates: keep marker/pencil/notes working in every change.
- A fullscreen toggle lives in the toolbar (key `F`); keep it.
