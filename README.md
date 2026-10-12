# nlibjs actions

公開npmパッケージのリリースを共有するGitHub Actions。nlibjsと個人アカウントのリポジトリから、固定SHAで再利用workflowを呼び出す。

Node 26.x、npm 11.21.0、cleanup-package-json 0.5.0を共通管理し、npmの承認待ちとGitHub Release公開を分ける。JSR公開は利用側の独立jobへ接続する。

## 利用方法

利用repoの `.github/workflows/release.yml` から呼ぶ。参照にはこのrepoのレビュー済み完全長コミットSHAを使う。

```yaml
jobs:
  Stage:
    permissions:
      contents: write
      id-token: write
    uses: nlibjs/actions/.github/workflows/npm-release.yml@REPLACE_WITH_REVIEWED_SHA
    with:
      action: stage
```

[examples](examples/README.md)に5repoと個人repoのcaller例を置く。例の共通workflow SHAは、レビュー・マージされた版へ置き換える。JSR例の `release:jsr` scriptは利用repo側で用意する契約であり、このrepoが自動追加するものではない。

## 入力と出力

| 入力 | 既定値 | 内容 |
|---|---|---|
| action | verify | verify / stage / finalize |
| version | 空 | finalizeのみ必須。vなしの通常semver |
| environment | 空 | deployment等。指定した環境の保護ルールを使う |
| cleanup-source | registry | registry / local。localはcleanup自身のビルド済みCLI用 |

出力はpackage-name、version、tag、source-sha、npm-state、github-state、jsr-ready、release-url。finalize成功時は、公開済みGitHub Releaseの再確認でもjsr-ready=trueとなり、JSRを再試行できる。

action/version/cleanup-sourceは実行前に検証する。入力をshellへ直接挿入しない。stage/finalizeはmainのpushまたはmainのworkflow_dispatchに限定し、verifyはpull_requestでも利用できる。

## 前提

- package.jsonはpublicな通常versionのnpmパッケージで、repositoryがcallerのGitHub repoと一致する。
- lockfileとlint/test/buildのnpm scriptsがある。追加準備が必要なら `release:prepare` にbuildも含める。
- CHANGELOG.mdには `## v1.2.3 (日付)` の形式で対象版の空でないノートがある。
- private package、private依存の認証、monorepo、prerelease、別registry、任意dist-tagは初期対象外。
- 利用repoのActions設定がこのpublic workflowを許可する。

Biome使用repoはdevDependenciesとlockfileで固定する。ESLint/Prettier等のrepoでも `npm run lint` の契約で利用できる。公開用Nodeを26.xへ統一しても、利用者向けの最低対応Nodeや互換性CIのmatrixは変更しない。

## 公開の手順

1. mainのpackage.json変更、または手動stageで公開前検証を行う。checkoutは全履歴を取得する。
2. lint/test/build後に必須cleanupを行い、tarballを1回作る。draft Releaseへtarballとintegrityを保存してからnpmへ送る。
3. `npm stage publish`の終了コード0を成功とする。stage IDの取得は補助で、取得できなくても成功する。
4. npmjs.comのStaged Packagesで人が2FA承認する。
5. callerのReleaseをmainで手動実行し、action=finalize、version=承認した版を指定する。
6. 保存したtarballとnpmのdist.integrity、固定SHAとタグを確認し、draftを公開する。JSRはこの後に実行する。

承認待ちをまたいでActions runを待機させない。finalizeは最新mainを再ビルドせず、draftの固定SHAとtarballを使う。手順はdraft本文とsummaryにも表示する。

## 既存versionと失敗時

| 状態 | 挙動 |
|---|---|
| npm公開済みと同versionタグがある | stageは成功no-op。依存更新だけで赤くならない |
| draftがある | 再stageせず、npm確認・承認・finalizeを案内 |
| draftなしでnpmかタグの片方だけがある | 不整合として停止 |
| draftやassetが重複・不足している | 候補や不足を示して停止 |
| stageが非0、送信結果が不明 | draftを保持。npm側を人が確認するまで再送しない |
| stageは0だが本文更新が失敗 | npm成功をsummaryに残す。draftがあるので再送しない |
| GitHub/JSRで失敗 | npm公開とintegrityが一致する同versionでfinalizeを再実行 |
| 同groupの待機runが置き換えられstage未実行 | 対象versionがmainにあることを確認して手動stage |

finalizeは公開済みReleaseも検査できるが、新形式assetがない過去Releaseを自動改変しない。タグは既存の解決SHAを確認し、新規作成はdraft公開時のGitHub処理へ任せる。公開後にもSHAを確認する。

draftは認証付きRelease一覧の全ページから探す。同じtag名が複数あれば停止し、最新候補を自動選択しない。保存情報はReleaseのtag_name/target_commitish、package.tgz、package.integrity。独自の記録schemaやstage ID依存の自動復元は持たない。

403/404のRelease操作失敗を「存在しない」と解釈しない。保存targetのworkflowファイルとdefault branchが異なる場合、GitHubが追加のworkflow変更権限を要求することがある。長期tokenを自動追加せず、その場合は設定・運用を確認する。

## 認証と権限

npm Trusted Publisherには **利用repoのowner/repo、release.yml、使用するenvironment** を登録する。共通repoをnpm公開元として登録しない。stageはcaller/callee双方にid-token: writeが必要。

verifyはcontents: readのみ。stageはcontents: writeとid-token: writeを1jobで使い、finalizeはcontents: writeのみ。environment付きstage/finalizeは各1jobなので、必須レビュアーを追加しても操作ごとに1回の承認となる。空入力はenvironmentなしjobへ分岐する。

npm tokenやsecrets: inheritは不要。secretsは利用repoへ置き、他用途で必要なら明示して渡す。runnerとGITHUB_TOKENはcaller側のものを使う。publicな共通処理を利用しても、callerの非公開コードやsecretを共通repoへ保存しない。

## 開発と検証

Node26.xとnpm11.21.0を使う。

```sh
npm ci --ignore-scripts
npm ci --prefix actions/npm-release --ignore-scripts
npm run lint
npm test
npm run check
```

テストには書き込みを拒否するローカル模擬registryを使ったdry-runが含まれる。実registryへの公開は行わない。CIは同じfixtureを実行し、workflow契約・権限・固定SHAも検査する。

実際のOIDCとprovenance署名は、先行repoの通常リリースで確認する。[R2検証結果](docs/tasks/t001-shared-workflows/verification.md)に検証済みの範囲を記載する。

## 共通基盤の更新

補助actionはworkflow内で完全長SHAへ固定する。更新は次の2段階で行う。

1. 補助actionの変更をコミットAとして保存する。
2. workflowの補助参照をAへ更新したコミットBを作り、組み合わせを検証する。
3. 利用repoの共通workflow参照をBのSHAへ更新するPRを作る。

問題があればcallerの参照SHAを以前の版へ戻せる。公開済みversionを巻き戻さず、失敗した公開先のみ回復する。

## 設計と導入計画

[合意済み設計](docs/tasks/t001-shared-workflows/design.md)、[担当とレビュー計画](docs/tasks/t001-shared-workflows/plan.md)、[作業記録](docs/tasks/t001-shared-workflows/record.md)。実装はCodex、技術レビューはClaude、最終承認・マージとnpmの2FA承認はユーザーが担う。定期finalizeや記録拡張は先行リリース後に判断する。
