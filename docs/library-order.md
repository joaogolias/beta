# Automatic card order

There is no authored ordering field. `shared/libraryOrder.ts` defines the same
rules for the library, direct study and the offline cache:

- Kanji: first kun’yomi, otherwise first on’yomi. Cards without either reading
  come after readable cards, ordered by creation time.
- Vocabulary: kana reading, with every hiragana reading before every katakana
  reading. Mixed readings use their first kana character to select the group;
  half-width katakana belongs to the katakana group. Explicitly omitted readings
  come last, ordered by creation time.
- Grammar and legacy exam cards: creation time, oldest first.

Equal readings use creation time, then database creation order. Offline-created
cards retain their original creation time when synchronized. Within a reading
group, gojūon weights normalize kana width; voicing and small/long forms break
ties after the complete base reading. The long-vowel mark expands to the previous
kana's vowel. This is bounded reading order, not full Unicode collation.

`cardOrderKey` and the index
`by_ownerId_and_archived_and_cardOrderKey_and_createdAt` implement these rules.
Legacy `sortKey` and `readingSortKey` remain in storage for compatibility, but new
clients neither ask for them nor use their authored values. New writes derive
all ordering fields. Existing records retain their old index keys during the
migration so switching readers can happen after the full backfill.

## Automatic faces and history

Kanji and vocabulary have automatic faces. Grammar uses its title on the front,
optional short explanation and examples on the back. The full explanation is
available only through **Ver explicação completa**, even when no summary exists.
Vocabulary requires a reading unless `readingOmitted: true`; omission stores an
empty reading. Grammar examples and short explanation can both be empty.

The migration recalculates current faces and increments the content version only
when those faces change. Metadata repairs do not change `updatedAt`. Existing
presentations, attempts and statistics are never rewritten: their frozen content
remains exactly as studied. New presentations use current automatic faces.

## Rollout per environment

Run from `backend/` against its configured development deployment. Production
requires its own authorized rollout. Do not use `--prod` for the dev migration.

1. Leave `LIBRARY_CARD_ORDER_ENABLED` unset or `false`, and deploy the widened
   schema and dual writes with `npx convex dev --once`. Existing reading-order
   settings continue to govern library reads until the new flag is enabled.
2. Run `libraryOrder:backfillCardModel` for **each** of `alphabetCards`,
   `vocabularyCards`, `grammarCards` and `examCards`, starting with this dry run:

   ```sh
   npx convex run libraryOrder:backfillCardModel '{"table":"alphabetCards","cursor":null,"dryRun":true,"batchSize":50}'
   ```

   Follow each returned `continueCursor` until `isDone: true`. Repeat using the
   other table names. Calls read at most 100 records and enforce a byte budget.
   Sum `scanned`, `needsUpdate` and `contentChanges` for the audit.

3. Traverse all four tables again with `dryRun: false`. The internal mutation is
   administrative, resumable and idempotent; archived cards are included.
4. Repeat complete dry runs and require `needsUpdate: 0` in every batch.
5. Enable the new index:

   ```sh
   npx convex env set LIBRARY_CARD_ORDER_ENABLED true
   ```

   Reopen libraries to start fresh pagination. Check kana groups, missing
   readings, creation ties and category/level filters.

## Rollback

Development rollout on 2026-09-21: 106 alphabet cards, one vocabulary card and
one grammar card migrated; no legacy exam cards existed. Only the vocabulary
and grammar cards changed faces. The final complete dry run reported zero
pending updates before enabling `LIBRARY_CARD_ORDER_ENABLED`. No records were
deleted and no study history was rewritten.

Set `LIBRARY_CARD_ORDER_ENABLED` to `false` and reopen libraries to use the previous
index. This rolls back ordering only; it does not restore authored faces, and
study history was never modified. Retain compatibility fields and indexes.
Changing the key algorithm again requires another backfill before switching
reads. `backfillReadingSortKeys` and `LIBRARY_READING_ORDER_ENABLED` are retained
for the previous rollout; they do not enable the current card model.

Kana behavior follows the principles in the
[Unicode collation FAQ](https://www.unicode.org/faq/collation.html) and
[CLDR Japanese kana tailoring](https://github.com/unicode-org/cldr/blob/main/common/collation/ja.xml).
