---
name: make-book
description: Convert an academic paper into a page-turning, annotatable single-file HTML book using the engine in C:\MyTemp\code\BuecherRegal\Book. Use this whenever the user asks to make a book from a paper, publication, manuscript, or preprint — or drops a .tex/.pdf file or arXiv link and says "book", "make it a book", "book edition", "reading edition", or wants a paper they can read page by page and annotate with highlighter, pencil, or notes — even if they haven't attached the paper yet (the skill starts by asking for a tex file, arXiv link, or PDF). Also use it to add or fix figures, chapters, or styling in a book previously produced this way.
---

# Make a book from a paper

Turn one publication into a single self-contained HTML file: fixed pages with 3D page
turns, KaTeX mathematics in Computer Modern, and reader annotation (highlighter, pencil,
sticky notes) persisted per-browser. The engine and a finished example live in
`C:\MyTemp\code\BuecherRegal\Book\` — that folder's `CLAUDE.md` (conversion playbook, owner
preferences, environment quirks) and `README.md` (build system, block vocabulary,
pagination internals) are the authoritative references. Read both before converting.

## Inputs

**If the user has not provided the paper, ask for it before doing anything else** — the
whole pipeline hangs on the source, so don't guess or go searching on your own. Ask for
one of (in order of preference):

1. a **`.tex` file** — a path on disk, or they can drag-and-drop / upload it into the chat;
2. an **arXiv link or ID** (e.g. `arXiv:2406.01234` or an abs/pdf URL) — then download the
   e-print source yourself from `https://arxiv.org/e-print/<ID>` (it's a tar/gzip that
   usually contains the `.tex`), never the PDF;
3. a **PDF** — path or upload — only if no LaTeX exists anywhere.

Use the AskUserQuestion tool if available (options: tex path / arXiv link / PDF, plus the
free-text "Other" for pasting a path or URL); otherwise ask in plain chat and wait. If the
user names a paper by title only, confirm you found the right one (title + authors) before
converting.

Why the preference order: LaTeX converts faithfully; a PDF must be extracted and
re-typeset, then every formula proofread against the original — subscripts and primes are
where silent errors creep in — and the final report must say the math came from PDF
extraction.

## Workflow

### Step 1 — convert TikZ figures to SVG first

Before touching the prose, mechanically convert every `tikzpicture`:

```bash
bash ~/.claude/skills/make-book/scripts/tikz2svg.sh <paper.tex> <bookdir>/figures
```

It extracts each `tikzpicture` with the preamble lines it depends on (tikz libraries,
colors, math packages, user macros), compiles via MiKTeX `latex` + `dvisvgm`, and writes
`fig-NN.svg` (text as paths — no font dependencies) plus the `fig-NN.tex` it compiled.
Failures leave a `fig-NN.err.log`; fix the standalone `.tex` by hand and recompile the
same way. If `standalone.cls` is missing, run `miktex packages install standalone` once.

Doing figures first matters: it tells you immediately how much hand-work the paper needs,
before hours are invested in the prose.

### Step 2 — create the book directory

Name it **`AuthorSurname Year Short-Title`** (first author's surname, publication year,
a shortened title), e.g. `Emmerich 2026 Riesz Subset Selection`. Default parent:
`C:\MyTemp\code\BuecherRegal\Books\`. Scaffold it:

```bash
bash ~/.claude/skills/make-book/scripts/new-book.sh "C:/MyTemp/code/BuecherRegal/Books/<Name>" <slug>
```

`<slug>` is the kebab-case form, e.g. `emmerich-2026-riesz`. The script copies the engine,
gives the book a **unique localStorage key** (without this, two books in one browser
overwrite each other's annotations), names the build output, and writes a front-matter
skeleton in `src/content.html` with TODO markers. Then set the two remaining identity
strings by hand: `<title>` and the toolbar title in `src/shell.html`, and the verso
running-head string in `src/book.js`.

### Step 3 — convert the content

Fill `src/content.html` following the block vocabulary table in
`C:\MyTemp\code\BuecherRegal\Book\README.md` ("Editing the content"). Keep the author's text verbatim.

**The mathematics must render exactly as in the paper — this is the whole point of the
book.** Copy every formula verbatim from the source, never retype from memory, and
proofread the rendered pages against the original. The engine's KaTeX pass recognizes
only `\(...\)` for inline and `\[...\]` (or `$$...$$`) for display math — **it deliberately
does not scan single `$`**, so a paper written with `$...$` must have every occurrence
converted to `\(...\)` (and `$$...$$` is safest converted to `\[...\]`) as part of
preparation. A missed one shows up as raw dollar-sign LaTeX in the running text, so after
building, search the rendered pages for stray `$` characters and for backslash commands
appearing as plain text — both mean an unconverted or broken formula. `\begin{equation}` /
`align` / `gather` bodies go inside `\[...\]` (use `aligned`/`gathered`), and any
environment or command KaTeX lacks must be rewritten to an equivalent it supports, never
dropped.

The traps that break the book silently (details in the README and CLAUDE.md):

- `&lt;` for every `<` inside math; a bare `<` starts an HTML tag.
- Port the paper's `\newcommand`s into the `macros` block of `typeset()` in `src/book.js`
  **before** converting the body.
- No LaTeX inside `<svg>` — use Unicode or `<tspan>` superscripts.
- Equation numbers are manual `\tag{n}`; `\ref`/`\cite` become fixed text; the
  bibliography becomes an ordinary chapter.
- Theorem-like environments → `<div class="lemma">`; exercises → `<div class="exercise">`.

Embed the Step-1 SVGs inline (paste the SVG markup, drop the XML prolog/comments) inside
`<figure class="figure tikz-embed">…<figcaption>` — the `tikz-embed` class makes the
engine invert them in night mode. For *simple* diagrams, consider instead redrawing as
hand-written SVG with the theme variables (`var(--figline)`, `var(--fig-accent)` …, see
the example book's figures) — those theme natively and look sharper; mechanical conversion
is the default, redrawing is the upgrade.

### Step 4 — build and verify

`bash build.sh` (Git Bash) produces the single-file book. Then run the verification
checklist in `C:\MyTemp\code\BuecherRegal\Book\CLAUDE.md` — serve locally, check zero page overflow,
zero `.katex-error`, **no leftover `$` delimiters or raw LaTeX in the rendered text**,
no stranded headings, TOC fits, no over-wide equations, and a draw→undo→reload annotation
round-trip.

**Final acceptance — inspect the finished book itself, not just the working copy.** Open
the built file and confirm it displays correctly end to end: cover, contents, and a sample
of pages from every region (a dense-math chapter, each figure, the appendices, the
references). Confirm the formulas *look right*, not merely that KaTeX didn't error —
take screenshots where the environment allows; where it doesn't, extract the rendered
text of the sampled pages and compare the formulas symbol by symbol against the paper's
source. A book whose math is wrong or whose pages render broken is not done, whatever the
programmatic checks say. Tell the user what was inspected and how.

### Step 5 — deliver

Copy the built book where the user wants it, open it if asked
(`start chrome --start-fullscreen "<path>"`), and publish the `--bare` build as a
claude.ai artifact with the `downloads` capability (the Export button uses it).

## Environment (this machine)

Windows 11 + Git Bash (bash/awk/perl). MiKTeX at `C:\MiKTeX\miktex\bin\x64`. **No Node;
the `python` on PATH is the Microsoft Store stub and hangs — never invoke it.** Build
tooling is bash+awk on purpose.
