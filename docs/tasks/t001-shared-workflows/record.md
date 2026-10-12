# 共通workflowの作業記録

## 依頼と合意

nlibjsの5repoのリリースを共通化し、gjbkzの個人repoでも利用可能にする。修正版R1はユーザー合意済み。public nlibjs/actions作成済み。R2として設計と計画を移設し、共通実装・検証をレビュー用PRにする。マージ・パッケージ導入・公開はR2/R3以降。

## 計画

1. repositoryと実行環境、固定npm/cleanup/Actionsの仕様を確認する。
2. verify/stage/finalizeのinterfaceと補助actionを実装する。
3. no-op、終了コード、draft/asset、タグ/配布物整合性、権限を検証する。
4. 5repoのverifyと文書・caller例を整え、R2のPRを提示する。

## 進捗

- mainにはREADMEとApache 2.0 LICENSEのみ。作業branch feat/shared-npm-releaseを作成した。
- R1の4入力、Node26.x、全件cleanup、stage1job、stage ID補助、draft+tarball+integrity、手動finalizeを実装方針とする。

## 重要な判断

- 現在の実装範囲に独自記録schemaや自動finalizeは含めない。
- 実registryの公開試験は行わない。

## 検証結果

- 以下へ進行に合わせて記録する。

### R2実装と初期検証

- cleanup0.5.0/npm11.21.0の公開を確認。固定npmソースでstageがpublish実装を継承しtarball入力、JSON stageId、provenanceオプションを扱うことを確認した。
- policy、release orchestration、GitHub/npm/filesystem adapter、composite action、reusable workflowを実装。終了コード0とstage ID補助、成功no-op、draft assetの事前保存、finalize integrity/タグ照合を含む。
- GitHub actions/checkout、setup-node等のv7実在SHAを取得した。helper actionの参照SHAは補助実装コミット後に固定する。
- fixture21件は合格。tarball dry-run追加検証はローカル待受のsandbox制限により別実行へ変更した。
- Node26.5.0/npm11.21.0でchangelog、cleanup-package-json、typing、negotiateのverifyが成功。lint-commitは実行中。
- 初回npm固定版取得はescalated環境のPATH差で失敗したためNode/npm絶対パスで取得。検証用cacheを作業用tempへ移し、sandboxのhome書込制約に依存しないようにした。

### R2最終検証とPR準備

- 24件のfixture/dry-runが成功。Node26.5.0/npm11.21.0で全5repoのverifyが成功。lint-commitもテスト47件とpackまで正常終了した。
- 初期tarballテストのJSON出力はpackage名でネストされていたため、固定CLIの実出力に合わせて確認した。dry-runに書き込みなし。
- Biome2.5.15をこのrepoの開発依存へ固定し、lint/整形を確認。actionlint1.7.12も成功。
- 補助actionコミットAは3fb64859ff81c0ee9699aafa75a74acf28d9a070。共通workflowの参照をこのSHAへ固定した。
- Git署名はsandbox内のgpg-agentアクセス制限で最初失敗。設定済み署名を維持し、許可された実行環境でコミットに成功した。
- R1資料と計画をdocs/tasksへ移設。例6件、README、検証結果を整理した。既存LICENSEは維持。
- 実際のOIDC、provenance署名、draft公開はR3後の通常リリースで確認する。fixture/dry-runの成功と実公開成功を区別する。
- レビュー用PRを作成予定。mainへのマージ、caller導入、npm/GitHub/JSR公開は行っていない。
