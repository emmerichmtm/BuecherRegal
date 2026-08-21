#!/bin/bash
# tikz2svg.sh <paper.tex> <outdir>
#
# Extracts every tikzpicture environment from a LaTeX source file and compiles
# each one to a standalone SVG (text converted to paths, so no font issues).
# Produces <outdir>/fig-01.svg, fig-02.svg, ... plus fig-NN.tex sources so a
# failed figure can be fixed by hand and recompiled.
#
# Requires MiKTeX (latex.exe + dvisvgm) on PATH or at C:\MiKTeX\miktex\bin\x64.
# First run may need MiKTeX to install the "standalone" package; if compiles
# fail with "standalone.cls not found", run:
#   miktex packages install standalone
set -u
TEX="${1:?usage: tikz2svg.sh <paper.tex> <outdir>}"
OUT="${2:?usage: tikz2svg.sh <paper.tex> <outdir>}"
MIK="/c/MiKTeX/miktex/bin/x64"
PATH="$MIK:$PATH"
mkdir -p "$OUT"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ---- 1. collect the preamble lines the figures depend on -------------------
# tikz/pgf packages, tikz libraries, colours, and user macros
awk '/\\begin{document}/{exit} {print}' "$TEX" | grep -E \
  '\\usepackage(\[[^]]*\])?\{[^}]*(tikz|pgf|xcolor|ams|mathtools|mathrsfs|bm|siunitx)[^}]*\}|\\usetikzlibrary|\\usepgfplotslibrary|\\pgfplotsset|\\tikzset|\\tikzstyle|\\definecolor|\\colorlet|\\newcommand|\\renewcommand|\\providecommand|\\def\\|\\DeclareMathOperator' \
  > "$WORK/preamble.tex" || true

# ---- 2. split out each tikzpicture environment -----------------------------
awk -v w="$WORK" '
  /\\begin{tikzpicture}/ { n++; f=sprintf("%s/body-%02d.tex", w, n); infig=1 }
  infig { print > f }
  /\\end{tikzpicture}/   { if (infig) close(f); infig=0 }
  END { print n > (w "/count") }
' "$TEX"
N=$(cat "$WORK/count" 2>/dev/null || echo 0)
if [ "$N" -eq 0 ]; then echo "no tikzpicture environments found"; exit 0; fi
echo "found $N tikzpicture environment(s)"

# ---- 3. compile each to SVG ------------------------------------------------
ok=0; fail=0
for j in $(seq 1 "$N"); do
  i=$(printf %02d "$j")
  b="$WORK/body-$i.tex"
  s="$WORK/fig-$i.tex"
  {
    echo '\documentclass[dvisvgm,tikz,margin=2pt]{standalone}'
    cat "$WORK/preamble.tex"
    echo '\begin{document}'
    cat "$b"
    echo '\end{document}'
  } > "$s"
  cp "$s" "$OUT/fig-$i.tex"
  ( cd "$WORK" && latex -interaction=nonstopmode -halt-on-error "fig-$i.tex" ) > "$WORK/fig-$i.log2" 2>&1
  if [ -f "$WORK/fig-$i.dvi" ] && \
     dvisvgm --no-fonts --exact -o "$OUT/fig-$i.svg" "$WORK/fig-$i.dvi" >> "$WORK/fig-$i.log2" 2>&1 && \
     [ -s "$OUT/fig-$i.svg" ]; then
    echo "fig-$i.svg  OK"
    ok=$((ok+1))
  else
    cp "$WORK/fig-$i.log2" "$OUT/fig-$i.err.log" 2>/dev/null
    echo "fig-$i      FAILED (see fig-$i.err.log; fix fig-$i.tex by hand and recompile)"
    fail=$((fail+1))
  fi
done
echo "done: $ok converted, $fail failed"
[ "$fail" -eq 0 ]
