# 共通workflowの実装とレビュー計画

現在の状態: 修正版でR1合意済み。public nlibjs/actionsは作成済み。CodexがR2の共通実装PRを準備中。

公開のnlibjs/actionsへリリース処理を集約し、changelogの先行導入を経て残り4件とgjbkzの個人repoへ展開する。技術レビュー担当はClaude、実装・検証・修正担当はCodex、最終判断とマージはあなたとする。Claudeへの資料共有はあなたが行う。各レビューには設計またはPR、変更点、検証結果、未解決事項を揃える。レビュー後に合意した範囲へ進み、全repoを一括でマージしない。

## 担当とレビューの節目

| 段階 | Codexの作業 | あなたの作業 | 次へ進む条件 |
|---|---|---|---|
| R1 設計レビュー | design.mdとcaller例を提示し、指摘を反映 | 公開順序とinterfaceをレビュー | 設計の合意 |
| 共通repo作成 | repo作成後、計画・設計・記録を移設 | publicのnlibjs/actionsを作成 | Codexがコードを追加できる権限とActions設定が整う |
| R2 共通基盤PR | reusable workflow、補助処理、README、fixture検証を実装 | PRをレビューし、マージ判断 | 状態判定・回復・権限の検証が通る |
| R3 changelog導入PR | SHA固定caller、cleanup、配布内容比較 | PRをレビューし、マージ判断。npm認証設定を確認 | OIDCなし検証と配布内容が合意される |
| 先行の通常リリース | 承認範囲でstage実行・結果確認・不具合修正を支援 | リリース対象を確認し、npmを2FA承認。finalizeを開始 | npm、GitHub Release、記録の整合性を確認 |
| R4 先行結果レビュー | 実リリース結果と回復手順を提示 | 結果をレビュー | 残り4件へ展開してよいと合意 |
| 残り4件の導入PR | lint-commitとcleanup-package-json、次にtypingとnegotiateへ個別PR | 各PRをレビューし、マージ判断。必要なenvironmentと認証設定 | 全repoで配布内容を比較し、検証・固有差分が合意される |
| R5 個人repo導入PR | 選ばれたrepoへの導入と検証 | 対象repoを選定し、設定・PRレビュー | owner非依存の利用が確認される |
| R6 CI共通化PR | Lint/Node CIを別変更として実装 | PRをレビューし、必須checkの設定を変更 | 既存テスト範囲と必須checkが維持される |

リポジトリ作成は今回はあなたの作業とする。現在のGitHubコネクタにrepo作成機能がないためで、実装準備は作成前にも進められる。READMEの初期作成は任意で、デフォルトブランチはmainを想定する。公開repoからの呼び出しとgjbkzでの利用のため、共通repoはpublicで作成する。

あなたに設定を依頼するときは、その直前に具体的な値と手順を提示する。secret値はチャットに送らず、利用repoへ直接登録する。npm認証設定と2FA承認、environmentの保護設定はあなたが担い、Codexが手順と確認を支援する。

## R1の完了条件

- [design.md](design.md) の公開順序、入力・出力、再実行、environmentの扱いが合意される。
- npm承認待ちではGitHubをdraftとし、JSRはfinalize後に公開するかを決める。
- 承認後にActionsでfinalizeを手動開始する運用を決める。
- [呼び出し例](../../../examples/README.md) が各repoと個人repoの利用方法を表している。

R1後はrepo作成とR2の実装へ進む。利用repoへの導入、npm staging、GitHub Release公開はR2/R3を経て行う。

## R2の重点検証

共通workflowの入力契約を通して、未公開、pending、既存公開の成功no-op、終了コード0でstage IDなし、送信結果不明、タグ不整合、draft/asset保存失敗、重複draft、finalize再実行をfixtureで検証する。cleanupのregistry/local両経路とtarball入力・provenance・固定npmの出力も確認する。

単なるタグ存在チェックや、npmの通信エラーを「未公開」とみなす実装は採用しない。stage前にdraftとtarball/integrityを保存し、stage成功後の失敗でも同じversionへ自動再送しないことを確認する。

## 導入時に確認する設定

- nlibjs/actionsがpublicで、利用repoのActions設定がその固定SHA参照を許可している。
- npm Trusted Publisherがcallerのowner/repo/release.yml/environmentと一致している。
- deploymentを使う2件は現時点で保護ルールなし。導入時に再確認し、保護を追加してもstage/finalize各1回となる。
- 各repoのlintツールはlockfileで管理する。Biome利用repoで最新版を追加インストールしない。changelogの追加install削除はR6または別PR。
- 必須check名と対応Nodeのテスト範囲が維持される。

通常リリース以外の実registryへの試験公開は行わない。R3後の先行リリースでOIDCとstagingを確認し、問題があれば残りのrepoへ展開する前に修正する。

## 更新と回復

共通基盤の更新は新しい固定SHAへの更新PRとして各callerへ適用する。問題があればcallerの参照SHAを前の版へ戻す。公開済みversionは巻き戻さず、失敗した公開先のみ回復する。

進捗、レビュー結果、設定変更、検証結果はdocs/tasksのrecord.mdへ随時記録する。R6後にREADMEと記録を最終更新する。

## 初期範囲とR4以降の拡張

R2の保存情報はdraftのtag_name/target_commitish、tarball、integrityとする。独自記録schema、run履歴の完全性検証、stage ID依存の復元、定期finalizeは実装しない。R4で通常リリースの結果を見て、必要な拡張だけ別PRとして提案する。

共通補助actionのSHA固定は、補助action変更を含むコミットAを作り、workflowがAを参照するコミットBを作る2段階で更新する。Bを検証してcallerにはBのSHAを提示する。この手順はR2のREADMEにも記載する。
