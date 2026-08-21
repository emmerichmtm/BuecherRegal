# BuecherRegal — the book factory

This repository turns academic papers into single-file, page-turning, annotatable HTML
books, and holds the finished books. Layout:

- `Book/` — the **engine** plus the first finished book (the Riesz §5–6 learning
  companion). `Book/CLAUDE.md` is the authoritative conversion playbook — read it before
  touching anything; `Book/README.md` documents the build system, the content block
  vocabulary, and the pagination internals.
- `Books/` — one folder per finished book, named `AuthorSurname Year Short-Title`, each
  self-contained (sources + built single-file book). `Books/index.html` is a small
  "Book Shelf" landing page for hosting the folder on a web server.
- `skills/make-book/` — snapshot of the Claude Code skill that drives the paper→book
  pipeline (TikZ→SVG conversion script, book scaffolder, workflow). The *live* copy on
  the owner's machine is `~/.claude/skills/make-book/`; when you change one, sync the
  other.

Serving: every built book is a single `.html` file with zero dependencies — any static
web server serves this repo as-is (point the docroot at `Books/`, or the repo root).
Reader annotations live in the reader's browser (localStorage, keyed per book), never on
the server.

Rules that matter here:

- Never edit a built `*_book.html` directly — edit `src/` in that book's folder and run
  its `build.sh` (Git Bash: bash + awk, no Node, and the `python` on PATH is the
  Microsoft Store stub — never invoke it).
- Engine changes (page geometry, annotation code, print/PDF, toolbar) belong in
  `Book/src/` and must be propagated to every book's `src/` copy, then all books rebuilt.
- Each book keeps a unique `STORE_KEY` in its `src/book.js` — collisions silently mix
  two books' annotations.
- Before declaring any book done, run the verification checklist and the final visual
  acceptance in `Book/CLAUDE.md`.
