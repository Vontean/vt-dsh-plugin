#!/usr/bin/env bash
# 视觉预览截图：用本机 Chrome 无头模式渲染 tools/visual 下的 fixture，浅色/深色各一张。
# 用途：改完 CSS 后不用等宿主热替换，先自己看一眼再交付。
#   bash tools/visual/shot.sh              # 两张基础 fixture
#   bash tools/visual/shot.sh charts       # 只拍图表与 mermaid
# 输出：/tmp/vt-gen-ui-preview/<page>-<theme>.png
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${OUT:-/tmp/vt-gen-ui-preview}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PAGES=("${@:-preview charts consistency mermaid}")
[ "$#" -gt 0 ] || PAGES=(preview charts consistency mermaid)

[ -x "$CHROME" ] || { echo "找不到 Chrome：$CHROME" >&2; exit 1; }
[ -f "$ROOT/lib/assets/standalone-runtime.js" ] || { echo "缺少构建产物，先跑 pnpm build" >&2; exit 1; }

mkdir -p "$OUT"
for page in "${PAGES[@]}"; do
  height=1500
  [ "$page" = "charts" ] && height=8200
  [ "$page" = "consistency" ] && height=4200
  [ "$page" = "mermaid" ] && height=4600
  for theme in light dark; do
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
      --force-device-scale-factor=2 --window-size=860,"$height" \
      --virtual-time-budget=12000 \
      --screenshot="$OUT/$page-$theme.png" \
      "file://$ROOT/tools/visual/$page.html?theme=$theme" >/dev/null 2>&1
    echo "· $OUT/$page-$theme.png"
  done
done
