#!/bin/bash
set -e
SRC=katex.min.css
OUT=katex.inline.css
cp "$SRC" work.css
grep -o '@font-face{[^}]*}' "$SRC" | while read -r blk; do
  woff2=$(echo "$blk" | grep -o 'fonts/KaTeX_[A-Za-z0-9_-]*\.woff2' | head -1)
  base=$(basename "$woff2")
  if [ -f "fonts/$base" ]; then
    b64=$(base64 -w0 "fonts/$base")
    fam=$(echo "$blk" | sed -n 's/.*font-family:\([^;]*\);.*/\1/p')
    sty=$(echo "$blk" | sed -n 's/.*font-style:\([^;]*\);.*/\1/p')
    wgt=$(echo "$blk" | sed -n 's/.*font-weight:\([^;]*\);.*/\1/p')
    echo "@font-face{font-family:$fam;font-style:$sty;font-weight:$wgt;font-display:block;src:url(data:font/woff2;base64,$b64) format(\"woff2\")}" >> faces.css
  fi
done
# strip all original @font-face blocks
sed -i 's/@font-face{[^}]*}//g' work.css
cat faces.css work.css > "$OUT"
rm -f faces.css work.css
wc -c "$OUT"
