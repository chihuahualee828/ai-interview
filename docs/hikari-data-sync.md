# Importing Hikari's prepared dataset

`npm run sync` reads `Hikari-Tsai/ai-interview`'s `main` branch without an LLM API key. It makes a temporary shallow bare Git clone, resolves one commit, and reads only regular JSON blobs from that commit. No upstream application code, dependency installation, hooks or scripts are executed. The upstream repository is only read; the script never pushes or creates a pull request.

| Imported paths | Purpose |
| --- | --- |
| `data/questions/Q*.json` | Question identities, wording and original README provenance |
| `data/answers/Q*.json` | Prepared translations, hints and answer text, with upstream statuses unchanged |
| `data/sources/<hash>.json` | Matching public source metadata required by freshness validation |
| `data/overrides/Q*.json` | Upstream pinned editorial answers, subject to local override priority |
| `data/state/upstream.json` | Original question-source provenance and timestamp |

`data/state/hikari-sync.json` records the imported Hikari commit and hashes of imported overrides. Hikari's generation retry/error state is not copied. Existing local generation state is retained but not used by this workflow. Original question links continue pointing to pallavi-shekhar/Outcome School; Hikari is the prepared dataset distributor.

## Local content and validation

- Ordinary question, answer and source directories follow the upstream snapshot, including removal of answers no longer present. An import that removes an existing question ID is rejected to protect permalinks and personal-answer associations; upstream retired question records can still be imported.
- Existing local `content/community/` is preserved and checked with the candidate dataset. Community precedence, authorship and sanitization are unchanged. This sync does not import Hikari's community Markdown.
- Local editorial overrides are preserved. An override that still matches its last imported hash can be updated or removed by upstream; an edited override remains local. On the first import, existing overrides are treated as local.
- App code, interface dictionaries, `.env`, OAuth configuration, Supabase RLS and private answers are unaffected. No Supabase migration is needed.
- The importer rejects symlinks, unexpected JSON paths, malformed JSON, oversized files and missing required data. Limits are 1 MiB per file, 64 MiB total and 10,000 files.
- Before replacing data, the existing fork validator checks schemas, question/source fingerprints, answer provenance, locale coverage and local community content. A failed fetch, parse or validation leaves the existing dataset untouched. There is no automatic relabeling to `ready` or `stale`.

Run only one local sync at a time. Candidate data is staged under ignored `.private/hikari-sync-*`. The final replacement uses same-filesystem renames; a failed second rename triggers rollback. A machine/process interruption between the renames may require restoring `previous-data` from that directory. Do not remove that backup if `data/` is missing.

If upstream changes its schema or adds untranslated tags, sync fails closed. Review compatibility with this fork before retrying; do not disable validation. If Hikari is unavailable, continue building the last committed dataset. Upstream answers that remain stale or absent continue to use the existing pending/review UI.

## Workflow behavior

Scheduled and manual runs import first, validate, test and build, then commit data in this fork. Push runs build the committed data without fetching upstream. Source metadata, overrides and the source-sync timestamp are included when deciding whether a rebuild is necessary. A Hikari commit change alone, with identical display data, does not require a rebuild.

Automatic generation and article refresh are removed. Commit summaries use `--no-llm`, even if a model key happens to be present. The manual workflow's `refresh_sources` input is removed; its `deploy` input is unchanged. Existing GitHub Pages and public Supabase variables remain in use. The optional local generator is unchanged and never invoked by this workflow.

For review, implementation changes and the initial imported snapshot are separate commits. No remote push, PR, merge or deployment is part of the local implementation.

## Verification of the initial import

- Snapshot: `09fc6d70eb2e313ffab168e310497858aad38a07`; all 935 imported files matched that commit byte for byte. It contains 598 questions, 226 answers (145 ready, 81 stale) and 110 source records.
- Unit suite: 62 passed, including importer boundaries, failed validation preserving data, idempotence, local contributions/overrides and forcing commit summaries offline even with model credentials present.
- Data validation and production build passed (1,799 pages at `/ai-interview/`). LLM credentials were blank and Supabase used synthetic public test configuration for the build.
- Type check: no errors or warnings; one existing `beforeunload.returnValue` deprecation hint.
- Eight mocked personal-answer browser tests passed against the static subpath build. Three additional local browser checks confirmed Q0001's translated title, full answer, 145-answer filter count, login panel and contribution controls in each language.

The full legacy browser suite and live OAuth/RLS checks were not rerun; no auth or database code changed. No live Actions run or deployment was triggered. The initial snapshot does not make the 81 upstream stale answers current; their existing display behavior is preserved.
