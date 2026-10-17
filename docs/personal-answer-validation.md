# Personal-answer sync validation

Run on 2026-10-18 (Asia/Taipei), using Node 24.21.0, npm 11.19.0, pinned Supabase JS 2.118.0, and Playwright Chromium. CI continues to use the repository's Node 22 setup. No real credentials, Supabase project, OAuth grant, deployment, PR or upstream push were used.

| Check | Result |
| --- | --- |
| `npm ci` | Passed. Lockfile installs cleanly; existing package versions unchanged. |
| `npm run validate` | Passed: 598 questions, 226 answers, 110 public source records, 3 locale dictionaries. |
| `npm test` | Passed: 55 tests, including 13 new personal-sync tests. |
| `npm run check` | Passed: no errors/warnings; one informational deprecated `beforeunload.returnValue` hint (retained for older browser warning compatibility). |
| `npm run build`, no sync config | Passed: 1,799 static pages, including callback. |
| Production host + `/ai-interview` build with synthetic public config | Passed: 1,799 static pages. |
| `npm run test:e2e:personal`, root path | Passed: 8 mocked browser tests. |
| `BASE_PATH=/ai-interview TEST_PREVIEW=1 npm run test:e2e:personal` | Passed: all 8 tests against generated static files. |
| Missing-config smoke test | Passed across en, zh-TW and ja, with reveal and contribution links available. |
| Full existing browser suite plus new missing-config test | **15 passed, 6 failed**; details and baseline comparison below. |
| Deliberately fake `sb_secret_…` build input | Correctly rejected before bundling, without printing its value. |
| Credential pattern scan | No matches in tracked/new source, generated text output or local validation logs (PEM private keys, GitHub token formats, Supabase secret formats, JWT credentials). This is not proof against every possible secret format. |
| Dependency audit | 8 findings in pre-existing packages: 3 high, 1 moderate, 4 low. No finding names the new Supabase packages. Details in setup guide. |
| Real OAuth / RLS / two-device tests | **Not executed**; dashboard configuration and live test accounts are required. |

The new tests cover composite user/question/locale keys; actual SDK REST request shape; signed-out behavior; loads; serialized and debounced writes; reverting edits during an in-flight save; failed network/load/delete retry; maximum length; expired credentials; stale loads/saves on logout/account switch; redirect containment and filter preservation; public-key validation; provider-token removal from response/storage/broadcast; real SDK PKCE request and mocked exchange; callback failure; XSS-safe textarea rendering; unload warning; keyboard navigation isolation; deletion/logout; failed logout retry; and mobile layout.

## Pre-existing browser failures

The feature checkout's full suite had these six failures:

- `companies.spec.ts`: company filter test — Playwright `.check()` reports that clicking did not change state during navigation.
- `practice.spec.ts`: tag filtering test — the same `.check()` / navigation behavior.
- `math.spec.ts`: expected `p_{I}` formula cannot be found in the selected rendered answer.
- `math.spec.ts`: expected question-title formula element missing, one case for each of en, zh-TW and ja.

To establish baseline, the unchanged starting `main` commit was exported to a temporary directory. The same installed dependency versions were used (existing package versions did not change); the temporary Vite configuration only allowed serving the shared dependency directory. With one worker, **the same six tests failed and the other 14 passed**. No existing assertions were changed or disabled. The feature adds one passing missing-config smoke test, hence 15 vs 14 passing tests. These failures are separate from personal sync and need a follow-up investigation before claiming the entire browser suite is green.

The existing PR checks (validation, all unit tests, Astro type check and production build) remain. New CI steps exercise the unavailable-config smoke test and the configured feature tests at both the root and static project subpath, with synthetic public values and mocked cloud traffic. The previous full browser suite was not part of PR CI and remains runnable unchanged.

## Review boundaries

`Contribute.astro`, community content/loading/precedence/sanitization, reference answer rendering, study navigation/history/locale logic, generation scripts and data files were not modified. The only question-card change imports/inserts the independent personal panel before the existing contribution component. No original-upstream remote was added. Deployment permissions were not expanded; its only change maps the two public Supabase repository variables into the build step. PR CI stays read-only with checkout credential persistence disabled.

The input `PLAN_PERSONAL_ANSWER_SYNC.md` was already untracked at task start and is left untouched, outside the implementation commits. The user's explicit no-PR instruction supersedes the plan's PR instruction.

Before release, complete the [manual setup and security acceptance checks](personal-answer-sync.md), including executing the rollback-only SQL tests in a disposable project, two real accounts with raw REST isolation attempts, actual GitHub consent scopes, provider-token visibility, two-device conflict behavior, logout/revocation and the live Pages callback. Review/remediate the dependency advisories. Automated tests do not certify deployed RLS or OAuth configuration.
