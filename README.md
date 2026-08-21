# BücherRegal

Academic papers as page-turning, annotatable books — each one a single self-contained
HTML file (KaTeX math in Computer Modern, highlighter/pencil/sticky-note annotation,
fullscreen reading, JSON and printable-PDF export of your marks). No server side, no
dependencies: open the file, read, annotate.

| | |
|---|---|
| `Book/` | the engine + the first book (*Learning Companion to §5–6 of the planar Riesz s=2 reduction*) |
| `Books/` | finished books, one folder each; `Books/index.html` is the shelf page |
| `skills/make-book/` | the Claude Code skill that converts a new paper into a book |

## Hosting (e.g. on a server)

```bash
git clone <this-repo> && ln -s "$(pwd)/BuecherRegal/Books" /var/www/books   # or point any docroot at Books/
```

Every book is static — `Books/index.html` lists them. Readers' annotations stay in their
own browsers.

## Building a book

Each book folder is self-sufficient: edit `src/content.html`, then `bash build.sh`
(needs only bash + awk). See `Book/README.md` for the authoring format and
`Book/CLAUDE.md` for the full conversion playbook.
