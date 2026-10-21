# midcareer-engineer — 中途｜ITエンジニア向けコンサル転職

- 公開URL: https://reflame.co.jp/lp/midcareer/engineer/
- 担当: 金山さん
- 仕組みの元: [reflameinc/midcareer-teacher](https://github.com/reflameinc/midcareer-teacher)（プルリクエストをマージすると本番に反映される仕組み）
- 困ったとき: 有川へ。画面に出た文をそのまま貼ってください

## いまの状態（2026-10-21 時点）

| 項目 | 状態 | やる人 |
|---|---|---|
| 自動反映の設定ファイル（`.github/`・`scripts/`） | 済み。midcareer-teacher と同じ内容で、転送先だけこのLP用 | — |
| main を守るルール・production 環境・サーバーの指紋（`DEPLOY_KNOWN_HOSTS`） | 済み | — |
| サーバーに入る鍵（`DEPLOY_SSH_KEY`） | 済み（2026-10-20 14:47 に有川が登録係で登録） | — |
| LPのファイル（`index.html`・`assets/`） | 済み（2026-10-20 15:05 金山さんが PR #1 をマージ） | — |
| 本番へ反映するスイッチ（`DEPLOY_ENABLED`） | **オン**。2026-10-20 15:36 に本番公開（本番の index.html がリポジトリと一致・assets 全て HTTP 200 を Actions のログで確認） | — |
| 公開後の確認（作業Cの4） | **未確認**（実施の記録なし）。予約ボタン4か所が予約ページへ移ることと、テスト予約1件で計測が動くことの確認 | 金山さん・有川 |

公開済みです。これ以降は、プルリクエストをマージした時点で本番に反映されます（下の「ふだんの直し方」）。

### このLPだけの違い（midcareer-teacher との差）

- 転送先は `/lp/midcareer/engineer/` に固定。初回の転送で `engineer/` フォルダが作られる（サーバーで事前に作る必要はない）。
- `/lp/midcareer/`（中途メインLP）の配下にあるが、中途メインLPの公開は削除同期をしないので、このLPが消えることはない。

## 作業A: サーバーに入る鍵を登録する（有川）

有川が登録係（`reflameinc/lp-deploy-key`）で登録する。担当の作業はない。

## 作業B: LPのファイルを入れる（金山さんのPC）

制作したLP（2026-10-20 に Slack で共有した `REFLAME_LP_コンサル` の `dist/`）を、このリポジトリに入れます。

1. reflame-marketing のフォルダで Claude Code を開く。
2. 下の文の `<　>` を、LPの元ファイルが入っているフォルダの場所に書き換えて貼る。

```
ITエンジニア向けコンサル転職LP（midcareer-engineer）に最初のファイルを入れて公開まで進めたいです。
LPの元ファイルは <このPCのフォルダの場所> にあります。
入れ方の決まりは reflameinc/midcareer-engineer の README.md の「作業B」に書いてあるので、先に読んでから始めてください。
```

3. Claude Code の質問に答えながら進める。プルリクエストができたら、表示されたURLをブラウザで開く。
4. 画面の下のほうに、緑のチェックと「check」の文字が出るまで待つ（1〜2分）。
5. 緑になったら「Merge pull request」→「Confirm merge」を押す（この時点ではまだ本番は変わらない）。
6. 有川へ「midcareer-engineer にLPを入れてマージしました」と連絡する（作業Cへ）。

赤い × が出たときは、×の横の「Details」を開き、🛑 が付いた行を Claude Code に貼って「これを直して」と頼みます。直らなければ、その行を有川へ送ってください。

### 決まり（Claude Code はここを読んで作業する）

- **入れるもの**: `dist/` の中身（`index.html`・`style.css`・`img/` の画像2つ）だけ。`CLAUDE.md`・`.claude/` などの説明・設定ファイルは入れない。
- **置き方**: `index.html` はいちばん上の階層。画像・CSS・JS・フォント・動画は、すべて `assets/` の中に置く。本番へ送られるのは `index.html` と `assets/` だけなので、いちばん上に置いた CSS や `img/` の画像は本番に届かない。
- **このLPで直すこと（元ファイルのままでは公開できない3点）**:
  1. `style.css` と `img/advisor-laptop.webp`・`img/advisor-laptop-sm.webp` を `assets/` へ移し（`img/` フォルダは無くす）、`index.html` の読み込み先を `assets/style.css`・`assets/advisor-laptop.webp`・`assets/advisor-laptop-sm.webp` に書き換える（`href` が1か所、`src`・`srcset` が2か所）。
  2. 計測を入れる。`index.html` の `<head>` の直後と `<body>` の直後に GTM（`GTM-5KH7WRCP`）のタグを入れる。入れ方は midcareer-teacher の `index.html` と同じ。予約完了は予約ページ（`slug=mid-ad-mk`）の側で計測されるので、LP側に `dataLayer.push` を足す必要はない（検品の WARN「dataLayer.push が1つも無く…」が1件出るのは想定どおり。STOP でなければ進めてよい）。
  3. ページ最上部の確認用の帯（`<div class="review-strip">確認用プレビュー …</div>`）を消す。公開前の確認用で、本番には出さない。
- **`assets/` に置ける種類**: png・jpg・jpeg・webp・gif・avif・ico・css・js・woff・woff2・mp4・webm。ファイル名は英数字と `_` `-` `.` だけ、拡張子は小文字。
- **noindex は残す**: 広告からの流入専用のため、`<meta name="robots" content="noindex,nofollow">` は消さない（消すと検品で止まる）。
- **上の3点以外の見た目・文言は変えない**: 迷ったら、勝手に決めず担当に見せて決めてもらう。
- **main に直接は入れられない**: ブランチを作る → プルリクエストを作る → 検品（check）が緑 → マージ、の順。
- **`.github/` と `scripts/` は触らない**: 変えると中山さんのレビューが必要になる。
- **検品は GitHub の画面で見る**: Mac に最初から入っている bash では `scripts/check.sh` がエラーで止まる。手元で動かなくても、プルリクエストの check が緑なら問題ない。

## 作業C: 本番へ反映するスイッチを入れる（有川）

1. 作業Bのマージ後、Actions の `deploy` が「▶ 予行演習モード」で動き、「転送予定 N 件」の一覧に `index.html`・`assets/…` が出ていることを有川が確かめる。
2. 有川がリポジトリ変数 `DEPLOY_ENABLED` を `true` にして、`deploy` をやり直す。
3. 本番へ転送され、「✓ 本番の index.html がリポジトリと一致」「✓ assets 全て HTTP 200」が出れば完了。
4. 担当が本番を開き、予約ボタン（ヘッダー・ファーストビュー・予約セクション・画面下の固定ボタンの4か所）が予約ページへ移ることを確かめる。1件予約し、計測が動くことを有川と確かめる。

## 作業A〜Cが終わったあとの、ふだんの直し方

reflame-marketing のフォルダで Claude Code に「ITエンジニア向けLPのここを直して」と頼みます（`lp` スキル）。ブランチを作る → 直す → プルリクエスト → check が緑 → マージ、の順で、マージした時点で本番に反映されます。戻すときは、マージ済みプルリクエストの「Revert」を押し、できたプルリクエストをマージします。

**GitHub に入れたLPは、サーバーへ直接上げない（FileZilla 等を使わない）。** 直接上げると、次の公開で GitHub の中身に上書きされて消えます。
