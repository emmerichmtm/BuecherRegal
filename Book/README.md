# The Riesz Companion — book sources

A page-turning, annotatable reading edition of *A Learning Companion to Sections 5 and 6*
(planar Riesz `s=2` reduction). The whole book compiles down to **one self-contained HTML
file** — fonts, maths engine, styles and content all embedded, nothing fetched from the
network.

```
Book/
├─ riesz_s2_sections5_6_book.html   ← the built book (this is the thing you read)
├─ build.sh                          ← assembles the parts into that one file
├─ src/
│  ├─ content.html   the book's text, maths and figures      ← edit this most
│  ├─ book.css       page design, typography, themes
│  ├─ book.js        pagination, page-turning, annotation, storage
│  └─ shell.html     the page skeleton + toolbar (has the build markers)
└─ katex/
   ├─ katex.inline.css   KaTeX styles with all fonts inlined as base64
   ├─ katex.min.js       the maths typesetter
   ├─ auto-render.min.js finds \( \) and \[ \] in the page
   ├─ katex.min.css      original, only needed to regenerate katex.inline.css
   ├─ build_css.sh       regenerates katex.inline.css from katex.min.css + fonts/
   └─ fonts/             the 11 woff2 faces the book uses
```

## Rebuilding

Needs `bash` and `awk` — you already have both via **Git Bash**. From this folder:

```bash
bash build.sh
```

That overwrites `riesz_s2_sections5_6_book.html`. To write somewhere else, pass a path:

```bash
bash build.sh /c/MyTemp/code/Book/preview.html
```

There is a second mode used for publishing to a hosted artifact, which omits the
`<!doctype html>` wrapper because the host supplies its own:

```bash
bash build.sh /c/MyTemp/code/Book/bare.html --bare
```

Never open a `--bare` file directly in a browser — without the doctype the page falls into
quirks mode and KaTeX refuses to typeset.

## Editing the content

`src/content.html` is plain HTML with LaTeX left in place. The block vocabulary:

| Markup | Becomes |
|---|---|
| `<h1 data-num="7">Title</h1>` | a chapter (flows on mid-page, or starts a fresh one when the page is nearly full) |
| `<h1 data-num="A" data-appendix="1">` | an appendix chapter |
| `<h2>Title</h2>` | a section within the chapter |
| `<p class="opening">` | first paragraph after a heading (not indented) |
| `<p><b class="runin">Lead-in.</b> text</p>` | a run-in paragraph heading |
| `<div class="eq">\[ … \]</div>` | a displayed equation |
| `<figure class="figure"><svg…><figcaption>` | a figure |
| `<div class="lemma">` / `<div class="exercise">` | the tinted boxes |
| `<div … data-nopaginate="1">` | a page all to itself (cover, contents, glossary) |

Four rules that will bite you otherwise:

1. **Write `&lt;` for every `<` inside maths.** `\(t<b\)` would be parsed as an opening
   `<b>` tag. Write `\(t&lt;b\)`.
2. **No LaTeX inside `<svg>`.** The typesetter deliberately skips SVG, so maths there stays
   as raw source. Use Unicode, or `<tspan dy="-5" font-size="9.5">` for exponents — see
   Figure 4 for the pattern.
3. **Equation numbers are manual**, via `\tag{7}` in the display, and references in the
   prose are written out as plain `(7)`. If you insert a numbered equation you have to
   renumber the later ones yourself.
4. **Only these macros exist**: `\R`, `\Q`, `\abs{}`, `\norm{}`. Everything else must be
   written in full. Add more in the `macros` block near the top of `src/book.js`.

Chapters, sections, page numbers and the two tables of contents are all generated at load
time — you never renumber a chapter or update a page reference by hand.

## How the pagination works

The page is a fixed **620 × 830 px** rectangle with a **492 × 706 px** text block (the
constants live at the top of both `book.js` and `book.css` and must agree). On load the
book typesets everything off-screen, then walks the blocks one at a time, measuring, and
starts a new page whenever the next block would overflow. It also keeps a lead-in paragraph
with the equation it introduces, keeps a subheading with the text under it, and splits long
numbered lists across pages while continuing the numbering.

Because the page size is fixed, the whole book is then scaled with a CSS transform to fit
your window — which is why the layout never reflows and your annotations stay pinned to the
right spot on the right page.

Add or remove text and the page count simply changes. One consequence: **annotations are
stored by page number**, so a substantial content edit will leave old marks on the wrong
pages. Export a backup before a big rewrite.

## How annotations are stored

Two canvases per page — highlighter *under* the text, pencil *over* it — plus sticky notes
as ordinary DOM elements. Strokes are kept as vectors, not pixels, so they stay crisp at
any zoom and the eraser can remove a whole stroke on contact. Only the pages near the
current spread hold live canvases; the rest are rebuilt from the stroke data as you turn
towards them, which keeps memory flat over a 48-page book.

Everything persists to `localStorage` under the key `riesz-companion-book-v1`, and the ⋯
menu exports and re-imports it as JSON.

## Regenerating the embedded fonts

Only needed if you upgrade KaTeX or want extra font faces (script, fraktur, typewriter):

```bash
cd katex
# drop the new katex.min.css, katex.min.js and any extra .woff2 into fonts/
bash build_css.sh          # rewrites katex.inline.css with base64 fonts
cd .. && bash build.sh
```

`build_css.sh` inlines only the faces actually present in `fonts/` and drops the
`@font-face` rules for the rest, which is what keeps the book under a megabyte.

## Chapter breaks

A chapter heading starts a new page only when fewer than `CHAPTER_BREAK` pixels (250, set
near the top of `src/book.js`) remain on the current one; otherwise it flows on with a
hairline above it. Raise the constant to `706` to force every chapter onto a fresh page,
or lower it to pack tighter.

## Print / annotated PDF

The ⋯ menu's **Print / PDF** button (also plain Ctrl+P) rebuilds the book as a flat stack
of fixed-size pages — content, highlighter and pencil strokes, and sticky notes rendered
in place — and opens the browser's print dialog; "Save as PDF" there produces the
annotated PDF. The print view is built on demand and torn down afterwards, so it costs
nothing while reading. Annotation JSON export is the separate **Export backup** button.
