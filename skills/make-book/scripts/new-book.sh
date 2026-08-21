#!/bin/bash
# new-book.sh "<target-dir>" <slug>
#
# Scaffolds a new book from the engine at C:\MyTemp\code\Book:
#   - copies the engine (src css/js/shell, katex, build.sh, tools)
#   - patches the localStorage STORE_KEY and export filename to <slug>
#     (unique per book, or two books in one browser overwrite each other's marks)
#   - sets the build output name to <slug>_book.html
#   - writes src/content.html as a front-matter skeleton with TODO markers
#
# The target dir is normally "AuthorSurname Year Short-Title" (spaces are fine,
# quote it). <slug> is the same in kebab-case, e.g. emmerich-2026-riesz.
set -eu
ENGINE="/c/MyTemp/code/BuecherRegal/Book"
TARGET="${1:?usage: new-book.sh \"<target-dir>\" <slug>}"
SLUG="${2:?usage: new-book.sh \"<target-dir>\" <slug>}"

[ -d "$ENGINE" ] || { echo "engine not found at $ENGINE"; exit 1; }
mkdir -p "$TARGET/src" "$TARGET/figures"

cp "$ENGINE/src/book.css" "$ENGINE/src/book.js" "$ENGINE/src/shell.html" "$TARGET/src/"
cp -r "$ENGINE/katex" "$TARGET/katex"
cp -r "$ENGINE/tools" "$TARGET/tools" 2>/dev/null || true
cp "$ENGINE/build.sh" "$TARGET/build.sh"

sed -i "s|^var STORE_KEY = .*|var STORE_KEY = \"$SLUG-book-v1\";|" "$TARGET/src/book.js"
sed -i "s|riesz-companion-annotations.json|$SLUG-annotations.json|" "$TARGET/src/book.js"
sed -i "s|OUT=\"\${1:-\$D/[^}]*}\"|OUT=\"\${1:-\$D/${SLUG}_book.html}\"|" "$TARGET/build.sh"

cat > "$TARGET/src/content.html" <<'SKEL'
<!-- ============ FRONT MATTER ============ -->
<div class="page-break cover-page" data-nopaginate="1">
  <div class="cover">
    <div class="cover-rule"></div>
    <div class="cover-kicker">TODO series/kicker</div>
    <h1 class="cover-title">TODO Title</h1>
    <div class="cover-sub">TODO subtitle</div>
    <div class="cover-orn">&#10087;</div>
    <div class="cover-meta">
      TODO authors<br>
      <span class="cover-dim">TODO venue / journal</span>
      <div class="cover-date">TODO Month Year</div>
    </div>
    <div class="cover-rule"></div>
  </div>
</div>

<div class="page-break howto-page" data-nopaginate="1">
  <h2 class="fm-head">Abstract</h2>
  <p class="abstract">TODO abstract text with inline math like \(s=2\).</p>
</div>

<div class="page-break howto-page" data-nopaginate="1">
  <h2 class="fm-head">How to use this book</h2>
  <ul class="howto">
    <li><b>Turn pages</b> by clicking the outer edge of a page, using the arrows below the book, or pressing <kbd>&larr;</kbd> / <kbd>&rarr;</kbd>.</li>
    <li><b>Highlight</b> with the marker &mdash; drag across any line, including displayed formulas. Press <kbd>H</kbd>.</li>
    <li><b>Write</b> with the pencil for margin scribbles and arrows. Press <kbd>P</kbd>.</li>
    <li><b>Pin a note</b> anywhere on the page and type into it. Press <kbd>N</kbd>.</li>
    <li><b>Erase</b> with <kbd>E</kbd>, undo with <kbd>Ctrl</kbd>+<kbd>Z</kbd>, and return to plain reading with <kbd>R</kbd>.</li>
    <li><b>Go full screen</b> with the expand button in the toolbar, or press <kbd>F</kbd>.</li>
    <li>Everything you write is saved in this browser automatically. Use <b>Export</b> in the toolbar to keep a backup of your annotations.</li>
  </ul>
</div>

<div class="page-break toc-page" data-nopaginate="1" id="tocPage">
  <h2 class="fm-head">Contents</h2>
  <div id="tocBody" class="toc-body"></div>
</div>

<!-- ============ BODY ============ -->
<h1 data-num="1">TODO first section title</h1>
<p class="opening">TODO converted content&hellip;</p>
SKEL

echo "scaffolded: $TARGET"
echo "  STORE_KEY      = $SLUG-book-v1"
echo "  build output   = ${SLUG}_book.html"
echo "  next: put figures in figures/, write src/content.html, add the paper's"
echo "        \\newcommand macros to typeset() in src/book.js, then bash build.sh"
