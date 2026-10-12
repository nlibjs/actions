# R2の検証結果

共通実装は公開を伴わない検証を行った。利用repoは作業用コピーでのみcleanupし、remoteへの変更やnpm/GitHub/JSR公開は行っていない。

## 5repoの公開前検証

各固定SHAでnpm11.21.0を使い、npm ci、lint、test、build、cleanup、pack、配布package.jsonの保持フィールドを確認した。checkoutは全履歴。

| repo | 固定SHA | Node | verify |
|---|---|---|---|
| changelog | `0b2b586369483cab60c5096d72dcc6dedc6012eb` | v26.5.0 | 成功 |
| lint-commit | `b8911187707ec7b7fee83ca1e3fb52002a48ad24` | v26.5.0 | 成功 |
| cleanup-package-json | `13e2553fa61b35b44eb26bdbdc37ff8c47f43e07` | v26.5.0 | 成功 |
| typing | `15c296e06c959e97cf997c625dbf3941f876f50d` | v26.5.0 | 成功 |
| negotiate | `185ed8850f37f3f8183429ead55c5cb8fe6c3394` | v26.5.0 | 成功 |

cleanup-package-json自身はビルド済みlocal CLI、他4件は固定registry版0.5.0を使用した。依存・exports・型情報・bin・sideEffectsなどを元のpackage.jsonと比較し、devDependencies/renovate除去と配布ファイルを確認した。既存CIのOS/Node/Bun/Deno matrixを代替する結果ではない。

## 共通実装の検証

24件のfixture/dry-runテストが合格。Biomeのlint、actionlint、workflow契約検査を実行した。

- 成功no-op、npmとタグの不整合、重複draft、通信/権限失敗、終了コード0でstage IDなし、非0と送信結果不明をfixtureで検証。
- tarball/integrity保存前にnpmへ送らないこと、stage成功後の本文更新失敗で再送しないことを検証。
- finalizeのnpm integrity、完全長target、annotated tag、公開済み再実行とJSR再試行の出力を検証。
- 実cleanupとnpm packを使用し、利用者向けフィールドを保持することを確認。
- 書き込みを拒否するローカルregistryとnpm11.21.0のstage dry-runで、保存tarballが入力でき、integrityが変わらず、registryへの書き込みがないことを確認。
- actionlint1.7.12でworkflow構文・式を確認。YAML、権限、inputs/outputs、caller契約、固定action参照も検証する。

## 導入時に残る確認

実際のOIDCとprovenance署名はR3後のchangelog通常リリースで確認する。dry-runは署名・npm registryのstage作成を実証するものではない。

GitHubのdraft作成・asset保存・公開に必要なtoken権限とtarget workflow差分の制約も通常リリースで確認する。失敗は未存在と解釈しない。JSRは各導入PRでrelease:jsr scriptと独立した検証を追加する。

R2でパッケージへの導入・公開やマージは行わない。
