#!/usr/bin/env bash
# ============================================================
# deploy-files.sh — 本番へ転送してよいファイルの一覧を作る（許可リスト方式・2026-09-29）
#
# 検品(check.sh)と転送(deploy.yml の rsync --files-from)が同じこの一覧を使う。
#
# 使い方:  bash scripts/deploy-files.sh <LPのルート>
#   stdout … 転送するファイル（相対パス・1行1件）
#   stderr … 違反(🛑)と参考情報(ℹ️)
#   終了コード … 違反が1件でもあれば 1
#
# 許可するもの:
#   - index.html（ルート直下・通常ファイル）
#   - assets/ 配下の通常ファイルで、拡張子が下の ALLOWED_EXT（小文字）のもの
# 止めるもの（🛑）:
#   - シンボリックリンク（どこにあっても）…サーバー上の別ファイル（wp-config.php 等）を指せるため
#   - assets/ 配下の許可外ファイル（php・.htaccess・svg・html 等）…サーバーで実行/解釈されうるため
#   - ファイル名に実行系の拡張子を含むもの（x.php.png 等の二重拡張子）
# 無視するもの（転送しない）:
#   - .git/ .github/ scripts/ README*.md .gitignore
# ============================================================
set -uo pipefail
root="${1:-.}"; root="${root%/}"
ALLOWED_EXT='png|jpg|jpeg|webp|gif|avif|ico|css|js|woff|woff2|mp4|webm'
# 名前の各要素は英数字・_・- で始まり、英数字・._- のみ（ドットファイル・空白・記号を拒否）
SEG='[A-Za-z0-9_-][A-Za-z0-9._-]*'
EXEC_RE='\.(php[0-9]*|phtml|phar|pht|phps|cgi|fcgi|pl|py|rb|sh|bash|asp|aspx|jsp|shtml|htaccess|htpasswd|ini)(\.|$)'

bad=0
viol(){ echo "🛑 転送禁止: $1" >&2; bad=1; }
info(){ echo "ℹ️  転送しない: $1" >&2; }

cd "$root" || { echo "🛑 フォルダが無い: $root" >&2; exit 1; }

if [ -L index.html ]; then viol "index.html がシンボリックリンク"
elif [ ! -f index.html ]; then viol "index.html が無い"
else echo "index.html"; fi

while IFS= read -r -d '' p; do
  p="${p#./}"
  if [ -L "$p" ]; then viol "$p（シンボリックリンク）"; continue; fi
  [ -d "$p" ] && continue
  case "$p" in
    index.html) continue ;;
    .github/*|scripts/*|.gitignore|README*.md) continue ;;
  esac
  if [ ! -f "$p" ]; then viol "$p（通常ファイルではない）"; continue; fi
  case "$p" in
    assets/*)
      if echo "$p" | grep -qiE "$EXEC_RE"; then viol "$p（実行されうる拡張子を含む）"
      elif echo "$p" | grep -qE "^assets/($SEG/)*$SEG\.($ALLOWED_EXT)$"; then echo "$p"
      else viol "$p（許可外の種類・名前。許可: $ALLOWED_EXT／英数字・_・-・. のみ／小文字の拡張子）"; fi
      ;;
    *) info "$p（index.html と assets/ 以外は本番へ送らない）" ;;
  esac
done < <(find . -mindepth 1 -path ./.git -prune -o -print0 | sort -z)

exit $bad
