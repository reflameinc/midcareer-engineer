#!/usr/bin/env bash
# ============================================================
# check.sh — GitHub Actions 用の【上げる前】の関門（preflight.sh の移植版）
#
# 正本: REFLAME-Virtual-team/output/06_マーケティング/LP/preflight.sh
# 移植時の差分:
#   - 項目1「作業コピーとの一致」は削除（GitHubが入口＝リポジトリ自体が正本のため）
#   - 項目4 の参照アセット検査に srcset と CSS url() を追加（preflight.sh の漏れ）
#   - 項目0 の転送ファイル許可リストを追加（2026-09-29・deploy-files.sh と共通）
#
# 使い方:  bash scripts/check.sh <LPのルート>   （既定 = カレントディレクトリ）
#          IS_MAIN=1 のときだけ noindex を要求しない（メインLP用）
# 判定: 🛑STOP が1件でもあれば exit 1（デプロイしない）。⚠️WARN は通す。
# ============================================================
set -uo pipefail
t="${1:-.}"; t="${t%/}"; h="$t/index.html"
STOP=0; WARN=0
stop(){ echo "  🛑 STOP: $1"; STOP=$((STOP+1)); }
warn(){ echo "  ⚠️  WARN: $1"; WARN=$((WARN+1)); }
ok(){   echo "  ✓ $1"; }

echo "=== $t"
if [ ! -f "$h" ]; then stop "index.html が無い"; echo "🛑 デプロイしません"; exit 1; fi

# --- 0) 転送ファイルの許可リスト（scripts/deploy-files.sh と同じ判定。転送もこの一覧だけを送る）
#   2026-09-29 追加: assets/ に php・.htaccess・シンボリックリンクを置くと、Code Owners を通らずに
#   サーバー全体（WordPress・wp-config.php）へ届くため。ここで止める。
here="$(cd "$(dirname "$0")" && pwd)"
if list=$(bash "$here/deploy-files.sh" "$t" 2> >(while IFS= read -r l; do echo "  $l"; done >&2)); then
  ok "転送ファイル $(printf '%s\n' "$list" | grep -c .) 件・全て許可リスト内（index.html＋assets の画像/css/js/フォント/動画）"
else
  stop "許可リスト外のファイルがある（上の 🛑 の行）。php・.htaccess・svg・html・シンボリックリンク等は本番へ送れない"
fi

# --- 2) noindex（メイン以外は必須）
if [ "${IS_MAIN:-0}" = "1" ]; then ok "メインLP（noindex不要）"
elif grep -qi 'name="robots"[^>]*noindex\|content="noindex' "$h"; then ok "noindex あり"
else stop "noindex が無い（サブLPはメインとほぼ同内容＝重複コンテンツになる）"; fi

# --- 3) 計測タグ
SRC=$(find "$t" -maxdepth 1 -type f \( -name "*.html" -o -name "*.js" \) 2>/dev/null)
grep -q 'GTM-5KH7WRCP' "$h" && ok "GTMコンテナ GTM-5KH7WRCP" || stop "GTMコンテナが入っていない＝一切計測されない"
has_push=0
if grep -qh 'dataLayer.push' $SRC 2>/dev/null; then
  has_push=1
  ok "dataLayer.push あり（$(grep -ohE "event: *'[^']*'" $SRC | sed "s/event: *'//;s/'//" | sort -u | tr '\n' ' ')）"
  lps=$(grep -ohE "lp: *'[^']*'" $SRC | sed "s/lp: *'//;s/'//" | sort -u | tr '\n' ' ')
  [ -n "$lps" ] && ok "lp値: $lps" || stop "dataLayerに lp が無い（GA4で(not set)になりLP別に分解できない）"
fi

# --- 3.5) SF予約枠(data-slug)の実在とCV設定
#   ⚠️ /config API はキャッシュされ即時反映されないことがある（2026-08-27 実測）
slug=$(grep -ohE 'data-slug="[^"]+"' "$h" | head -1 | sed 's/data-slug="//;s/"//')
if [ -n "$slug" ]; then
  cfg=$(curl -s -m 15 "https://designer.my.site.com/schedulingvforcesite/services/apexrest/booking/v1/config?slug=$slug" 2>/dev/null)
  case "$cfg" in
    *'Link not found'*) stop "予約枠 $slug がサーバー上に存在しない（Link not found）。予約フォームが表示されない" ;;
    *'"cvEnabled":true'*)
      ev=$(echo "$cfg" | sed -n 's/.*"cvEventName":"\([^"]*\)".*/\1/p')
      [ "$ev" = "schedule_complete" ] \
        && ok "予約枠 $slug 実在・cvEnabled=true・event=$ev" \
        || stop "予約枠 $slug のイベント名が '$ev'。GTMトリガー(schedule_complete)と不一致＝CVが1件も飛ばない"
      echo "$cfg" | grep -q '"gtmId":null' && warn "予約枠にGTM IDが未設定。GA4へ届かない可能性がある（slug=$slug）"
      ;;
    *'"cvEnabled":false'*)
      [ $has_push -eq 1 ] && ok "予約枠 $slug 実在・cvEnabled=false（CVはLP側pushが担当）" \
        || stop "計測ゼロ。LP側に dataLayer.push が無く、予約枠 $slug も cvEnabled=false"
      ;;
    *) warn "予約枠 $slug の設定を確認できなかった（ネットワーク不通？）。手動で確認すること" ;;
  esac
elif [ $has_push -eq 0 ]; then
  warn "LP側に dataLayer.push が1つも無く、予約枠も無い。GTMクリックトリガー方式なら意図的。方式が未決なら計測ゼロ"
fi

# --- 4) 参照アセットの実在（src / href / srcset / CSS url()）
miss=0
while IFS= read -r a; do
  [ -z "$a" ] && continue
  [ -f "$t/$a" ] || { stop "参照アセットが無い: $a"; miss=1; }
done < <(
  {
    grep -oE '(src|href)="[^"]+"' "$h" | sed 's/^[a-z]*="//;s/"$//'
    grep -oE 'srcset="[^"]+"' "$h" | sed 's/^srcset="//;s/"$//' | tr ',' '\n' | awk '{print $1}'
    grep -oE 'url\([^)]+\)' "$h" | sed "s/^url(//;s/)$//;s/[\"']//g"
  } | grep -E '\.(png|jpe?g|svg|gif|webp|avif|css|js|woff2?)(\?.*)?$' \
    | grep -vE '^(https?:)?//|^data:' | sed 's/?.*$//' | sort -u
)
[ $miss -eq 0 ] && ok "参照アセット全て同梱（src/href/srcset/url()）"

# --- 5) 親フォルダ参照
grep -qE '(src|href|srcset)="\.\./|url\(["'"'"']?\.\./' "$h" && stop '../ で親フォルダを参照している（自己完結が原則）' || ok "自己完結（../ 参照なし）"

# --- 6) localhost / テスト残骸
grep -qiE 'localhost|127\.0\.0\.1|ngrok' "$h" && stop "localhost/テストURLが残っている" || ok "localhost残骸なし"

# --- 7) スマホ最低フォント14px（警告のみ）
small=$(grep -oE 'font-size: *(1[0-3]|[0-9])px' "$h" | sort -u | tr '\n' ' ')
[ -n "$small" ] && warn "14px未満のfont-size指定: $small（スマホ最低14pxルール。PC限定指定なら通してよい）" || ok "font-size 14px未満なし"

echo "==============================="
if [ $STOP -gt 0 ]; then echo "🛑 デプロイしません（STOP $STOP件 / WARN $WARN件）"; exit 1
elif [ $WARN -gt 0 ]; then echo "⚠️  STOPなし・WARN $WARN件（デプロイは続行）"; exit 0
else echo "🟢 全項目パス"; exit 0; fi
