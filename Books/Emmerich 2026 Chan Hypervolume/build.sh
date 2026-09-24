#!/bin/bash
set -e
D="$(cd "$(dirname "$0")" && pwd)"
SRC="$D/src"
K="$D/katex"
OUT="${1:-$D/emmerich-2026-chan-hv_book.html}"

BARE="${2:-}"
{
if [ "$BARE" != "--bare" ]; then
  printf %s "<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\">
<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,maximum-scale=5\">
<meta name=\"color-scheme\" content=\"light dark\">
"
fi
awk -v katexcss="$K/katex.inline.css" \
    -v bookcss="$SRC/book.css" \
    -v katexjs="$K/katex.min.js" \
    -v autojs="$K/auto-render.min.js" \
    -v content="$SRC/content.html" \
    -v bookjs="$SRC/book.js" '
function dump(f,  line){ while((getline line < f) > 0) print line; close(f) }
{
  if (index($0,"/*__KATEX_CSS__*/")) { print "<style>"; dump(katexcss); print "</style>"; next }
  if (index($0,"/*__BOOK_CSS__*/"))  { print "<style>"; dump(bookcss);  print "</style>"; next }
  if (index($0,"/*__KATEX_JS__*/"))  { print "<script>"; dump(katexjs); print ""; dump(autojs); print "</script>"; next }
  if (index($0,"/*__CONTENT__*/"))   { print "<div id=\"source\">"; dump(content); print "</div>"; next }
  if (index($0,"/*__BOOK_JS__*/"))   { print "<script>"; dump(bookjs); print "</script>"; next }
  print
}' "$SRC/shell.html"
if [ "$BARE" != "--bare" ]; then printf %s "</body>
</html>
"; fi
} > "$OUT"

echo "built: $OUT"
wc -c "$OUT"
