# リリースworkflowの呼び出し例

各callerは利用repoの `.github/workflows/release.yml` へ置く。`REPLACE_WITH_COMMON_WORKFLOW_SHA` はレビュー・マージ済みの完全長SHAへ置き換える。例はrepoへ自動導入されない。

| 例 | 固有設定 |
|---|---|
| changelog.release.yml | npmのみ |
| lint-commit.release.yml | environment: deployment |
| cleanup-package-json.release.yml | deployment、cleanup-source: local |
| typing.release.yml | finalize後にJSR |
| negotiate.release.yml | finalize後にDenoでJSR |
| gjbkz-package.release.yml | owner固定なし。選定repoへ適合確認して利用 |

manual actionはverify（公開しない検査）、stage（mainのpackage.jsonの版）、finalize（指定version）から選ぶ。finalizeのversionはvなしの通常semverだけを扱う。prerelease、別registry、monorepoは初期対象外。

npm承認後はmainでaction=finalizeとversionを指定する。GitHub/JSRの失敗後も同じ操作で回復する。待機runが置き換えられstageされていなければ、対象versionがmainにあることを確認して手動stageする。

npm公開済みとタグが揃う同versionはstage成功no-op。draftがあれば再送せず承認/finalizeを案内する。片方だけや通信失敗を未公開とはみなさない。

## JSR側の準備

typing/negotiateの例は `release:jsr` scriptを利用repoへ追加する契約を含む。metadataと既存versionの内容・公開元を照合し、未公開時だけbuild/dry-run/publishする。typingは現行npx jsr、negotiateはcheck:release・build:index・生成物diff・Deno publishを継承する。CLIの版は導入時に固定する。

callerは共通側のsource-shaをcheckoutする。finalizeは公開済みGitHub Releaseでもjsr-ready=trueを返すので、JSRだけを再試行できる。npx jsr scriptの追加はこのPRでは行わず、R4以降の各導入PRでレビューする。

## npm設定

Trusted Publisherはcallerのowner/repo/release.yml/environmentを登録する。個人repoならownerはgjbkz。nlibjs/actions自体を公開元に登録しない。npm tokenやsecrets: inheritは不要。

## 更新

補助action変更のコミットA、workflow参照更新のコミットBを作り、Bを検証してcallerへ提示する。詳細はルートREADMEに記載する。
