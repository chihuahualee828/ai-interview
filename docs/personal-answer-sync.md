# Private personal-answer sync

Personal answers are optional Markdown/math notes stored as source text in Supabase. They never write to GitHub, create a PR, run generation, or trigger a site rebuild. Public reference answers, community precedence/attribution, `Contribute.astro`, existing question permalinks (including retired questions), visit history and locale preferences retain their existing behavior. The site remains an Astro static export.

## Manual setup (required before enabling sync)

1. Create a Supabase project. In its SQL editor apply `supabase/migrations/202610180001_personal_answers.sql` **once** as the project administrator. Do not run migrations during builds. The migration creates a composite `(user_id, question_id, locale)` primary key, a 30,000-character constraint, server timestamps, authenticated-only grants, and four owner-only RLS policies. It enables and forces RLS. `service_role` still bypasses RLS; it must never be used in this application.
2. In GitHub **Settings → Developer settings → OAuth Apps**, register a **separate** OAuth App. Homepage: `https://chihuahualee828.github.io/ai-interview/`. Authorization callback: copy the **exact** Supabase GitHub-provider callback, normally `https://<project-ref>.supabase.co/auth/v1/callback`. This GitHub setting must point to Supabase, not Pages. Leave Device Flow disabled.
3. In Supabase **Authentication → Sign In / Providers → GitHub**, enable GitHub and enter the OAuth Client ID and Client Secret there. Keep the secret only in Supabase provider settings. Never paste credentials into prompts, issues, logs, source files, or GitHub build variables. No PAT, GitHub password, passkey, cookie, recovery code, or repository authority is needed.
4. In Supabase **URL Configuration**, use these exact URLs (no production wildcards):

   | Setting | URL |
   | --- | --- |
   | Site URL | `https://chihuahualee828.github.io/ai-interview/` |
   | Production allowed redirect | `https://chihuahualee828.github.io/ai-interview/auth/callback/` |
   | Local allowed redirect, `BASE_PATH=/` | `http://127.0.0.1:4321/auth/callback/` |
   | Optional local subpath test redirect | `http://127.0.0.1:4321/ai-interview/auth/callback/` |

   Keep only local URLs you actually use. `localhost` and `127.0.0.1` are distinct origins; do not switch between them during PKCE. Preview port 4322 needs its own exact redirect only if testing real OAuth there. Mock browser tests on port 4323 do not need dashboard configuration.
5. Copy `.env.example` to an ignored `.env.local` for local development. Set **only** `PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>` for this feature. Prefer `sb_publishable_…`; legacy JWT keys with the `anon` role are accepted. Hosted `*.supabase.co` HTTPS endpoints are supported; custom domains and local Supabase endpoints would require a reviewed change to configuration validation. Missing both values disables sync gracefully. Partial/unsafe configuration fails the build without printing values.
6. In **this fork's** GitHub repository **Settings → Secrets and variables → Actions → Variables**, set `SITE_URL=https://chihuahualee828.github.io`, `BASE_PATH=/ai-interview`, and the same two public Supabase values. They are intentionally public and are embedded at build time. Never put OAuth Client Secret, Supabase secret/service-role keys, access/refresh tokens, or LLM secrets in `PUBLIC_*`. The existing deployment workflow maps only the two new public variables into its build step. Setting variables alone does not update an already built site. The reviewer controls any future merge/build/deployment; this implementation does not deploy.

The build validates public configuration before bundling, but this is not a universal secret detector. The deployment workflow imports prepared Hikari data and supplies no model credentials; commit summaries explicitly disable LLM calls. Review every future public build variable and generated artifact.

## Authentication and token boundary

The lazy browser client uses pinned `@supabase/supabase-js` **2.118.0**, PKCE, explicit static-page code exchange, automatic refresh and a project/base-specific storage key. It does not request additional GitHub OAuth scopes. The mocked authorization-request test checks the provider, fixed callback, PKCE S256 challenge and absence of extra scopes. **The real Supabase-to-GitHub request and consent screen must still be inspected**: provider defaults are server-side configuration and cannot be proved by unit tests. Reject repository, workflow, administrative or write scopes.

Inspection of this SDK's `GoTrueClient._saveSession` and `_notifyAllSubscribers` showed that it copies/persists and broadcasts sessions, including provider credentials. Our fetch wrapper removes `provider_token` and `provider_refresh_token` from successful `/auth/v1/token` responses **before** SDK processing. The storage adapter additionally strips those fields on writes and when reading an older stored session. No app code logs auth responses, sessions, personal answers, or tokens; no analytics or third-party scripts were added. The raw HTTPS response can still contain provider credentials in transient browser memory/DevTools. Do not export HAR files containing credentials or upload Playwright traces from real OAuth sessions. Mock test traces contain synthetic tokens only.

Only Supabase access/refresh tokens are persisted in localStorage to maintain login across reloads. Other scripts on the same origin, XSS, or a compromised dependency can access them. A Pages subpath is **not** an origin isolation boundary: audit other sites hosted on the same `chihuahualee828.github.io` origin, or use a dedicated origin if stronger isolation is needed. Code here cannot read GitHub's own `github.com` login cookies. Never store GitHub tokens for the contribution flow.

The return route is saved in sessionStorage, validated both before login and after callback, and restricted to a same-origin, base-contained question permalink plus known study filters. Auth parameters and fragments are discarded. The callback removes its query/hash immediately, uses `no-referrer`, displays generic errors, and never renders provider error descriptions. PKCE requires the same browser/profile that initiated login. A canceled, reused, expired, or missing code offers a return link and a fresh login attempt.

## Editing and conflict behavior

See [personal note editor](personal-note-editor.md) for formatting examples and the latest validation results.

- GitHub sign-in/sign-out is in the top-right header. Notes open in a rendered view; double-click the note section, choose Edit note, or focus the preview and press Enter/Space to edit.
- Notes support Markdown headings, emphasis, lists, code, and LaTeX math (`$...$` inline, `$$` on separate lines for display math). The original source text is saved to Supabase; there is no schema migration or device-local answer cache. Rendering happens locally in the browser using bundled dependencies.
- Raw HTML is displayed literally, image syntax becomes alt text, and Markdown is sanitized before KaTeX runs with `trust: false`, strict parsing, and expansion/size limits. Unsafe link protocols are removed; preview links open with `noopener noreferrer`. Invalid math remains readable. No private note image or math command can trigger an external image request.
- Load/save/delete always include authenticated session user ID, stable question ID, and locale. Client filters are defense in depth; database RLS is the security boundary.
- Initial loads disable editing so a failed read cannot become an accidental overwrite. Load failures can be retried.
- Only Save & close explicitly submits a note. Enter and Shift+Enter insert newlines using native textarea behavior; IME confirmation and held/repeated Enter do not submit. Typing, blur, and waiting never save. Escape/Cancel discards edits after confirmation and restores the saved version.
- The editor remains visible and disabled during a save, and closes only after acknowledgement. A failed save keeps the draft open for Retry; a failed delete can be retried with Delete. Reload is disabled while a draft/write is pending. Editing during an in-flight request at the controller level remains an unsaved draft until a new explicit save.
- Navigation with pending edits/writes triggers the browser's unsaved-change warning. Save explicitly and wait for “Saved” before leaving. Browsers may not warn on mobile force-close or OS termination, and there is no guaranteed unload flush. Sign-out/re-login with pending edits uses a discard confirmation.
- Signing out or switching accounts cancels requests and clears both the editor and rendered preview immediately. Late responses are ignored. An already submitted write may still finish under the previous user's authorization; cancellation cannot roll back a server-accepted request. Reopening a cached page reloads auth state before displaying private data.
- Logout uses Supabase `scope: local` (this browser session, including tabs sharing storage), clears displayed data immediately, and offers retry if session revocation fails. On shared devices complete logout while connected. Logout does not revoke the GitHub OAuth grant.
- Across devices, the last database write wins; there is no merge or optimistic concurrency lock. The server supplies `updated_at`, displayed as the last saved time. Use “Reload saved answer” before editing on another device. No background answer refresh replaces active drafts. Delete affects only the selected question/locale; another device can recreate it with a later save.

## Validation commands

```sh
npm ci
npm run validate
npm test
npm run check
npm run build
npm run test:e2e
npm run test:e2e:personal
```

`test:e2e` includes the existing study/community suite and unavailable-config smoke test; run with both public sync variables absent. `test:e2e:personal` runs a separate local server with **synthetic public config and intercepted network requests**, exercising the actual SDK and browser UI without live accounts. CI installs Chromium and runs the new unavailable-config smoke test and the configured feature suite. The existing full browser suite remains available unchanged; its baseline failures are recorded in the validation report. Never substitute real tokens in test fixtures.

To test the production subpath as static files without enabling real sync:

```sh
SITE_URL=https://chihuahualee828.github.io BASE_PATH=/ai-interview \
PUBLIC_SUPABASE_URL=https://example.supabase.co \
PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test_only npm run build
BASE_PATH=/ai-interview TEST_PREVIEW=1 npm run test:e2e:personal
```

The example key is a deliberately nonfunctional mock. Do not deploy a mock-config build. Build again with the intended environment before any future release. On restricted environments `ASTRO_TELEMETRY_DISABLED=1` avoids Astro writing its telemetry preference outside the workspace.

## Required manual security acceptance tests

These are release gates, **not claims of completed verification**:

1. **Actual OAuth scopes:** with a fresh test grant, inspect the GitHub authorization URL's decoded `scope` and consent screen. Identity/email permissions only; no repositories, workflow, delete/admin/write authority. Inspect existing grants as well, since GitHub can retain previously granted permissions. Test cancellation, code replay, reload, expiry, and an attempt to exchange a code from another browser (must fail PKCE).
2. **RLS SQL:** apply the migration to a disposable Supabase project, then run `supabase/tests/personal_answers_rls.sql` in its SQL editor. It uses two synthetic auth IDs and anonymous role, checks CRUD/upsert isolation, ownership changes, length and timestamp enforcement, and rolls back. Successful completion must end in `ROLLBACK`; any exception means failure. If the editor stops on an error, explicitly roll back. This does not replace real-token HTTP tests.
3. **Two real accounts, raw REST requests:** sign in with separate GitHub test accounts A and B in separate browser profiles. Save different answers to the same question/locale. Using each profile's own Supabase session through DevTools (never copy it to a shared log), request the table with filters removed and with the other user's ID. SELECT must return only own rows; cross-user UPDATE/DELETE must affect zero rows, and forged INSERT/upsert or moving `user_id` must be denied. Use just the public API key with no authenticated JWT for anonymous CRUD: all must be denied. Recheck row contents as both owners after attempted mutations. Service-role/dashboard-admin queries do not test RLS.
4. **Session switching:** sign out A, switch to B, change accounts while a GET/save is delayed, and test two open tabs, back/forward cache, expired/revoked sessions, failed logout and retries. No A text should appear for B. Ensure logout finishes successfully on shared devices.
5. **Two devices:** save as A on device one, sign in as A on device two and reload; verify the same question and locale, plus different locale/question isolation. Edit on both to confirm documented last-write-wins; test deletion and recreation.
6. **Browser/credential review:** inspect only in a trusted local session. Confirm personal traffic goes to the configured Supabase project, there are no GitHub API writes/analytics, stored sessions and BroadcastChannel messages omit provider credentials, and rendered payloads such as `<img src=x onerror=alert(1)>` remain inert text; Markdown images and math image commands must cause no external requests. Inspect built JS and CI artifacts for any actual secret values without logging those values. Inspect other same-origin apps.
7. **Public regression:** public browsing, hints/reveal, filters, random/sequential history, locale navigation, retired permalinks, community attribution and GitHub edit/discussion links must work when sync is disabled or unavailable. Confirm the exact production Pages URL and static callback return HTTP 200 on the eventual deployment.

## Security review and known limits

New dependencies are the pinned Supabase SDK and its lockfile-resolved transitive packages. There are no new scripts from CDNs, servers, adapters, PATs, or privileged PR triggers. Contribution CI remains `contents: read` with checkout credential persistence disabled. The update job retains `contents: write` to commit imported data and Pages/id-token permissions for deployment; these permissions already existed and are not used for personal answers. Checkout credentials are unchanged. Dataset updates now use the read-only [Hikari import](hikari-data-sync.md) rather than model generation. No `pull_request_target` workflow is introduced. Public Supabase values remain build variables; CI smoke tests use fake values.

The install audit reported **8 existing dependency findings: 3 high, 1 moderate, 4 low**. The pre-existing lockfile package versions are unchanged. Findings: `http-cache-semantics` (high, cross-user cached responses), `sharp` (high, librsvg), `source-map-js` (high, indexed source-map DoS), `smol-toml` (moderate, parse complexity), and KaTeX plus its math dependency paths (low, trust bypass when prototype pollution already exists). No finding names the new Supabase packages. These require maintainer review/remediation before release; no force-upgrade or downgrade of the existing rendering stack was applied. Re-run `npm audit` because advisory state changes. Browser storage and same-origin XSS remain relevant even with RLS; RLS limits cross-account access, not malicious use of the current user's own session.

No real Supabase project, GitHub OAuth application, database credentials or two-account sessions were supplied. Therefore live OAuth consent, database execution, actual RLS enforcement, two-device sync, live logout/revocation and production hosting/network checks remain unverified. Automated mocks are regression evidence, not proof of deployed security. See `docs/personal-answer-validation.md` for the actual local run results.

## Operations, rollback and incident response

For unavailable sync, check the two build variables, exact redirect allowlist, provider configuration, project pause status, database migration/grants/RLS, Auth rate limits, and project quotas in Supabase. Resume a paused project and retry; preserve drafts by copying them privately before leaving. Do not “fix” database errors by adding GitHub scopes or disabling RLS. Browser errors intentionally omit tokens and provider details; inspect trusted local network status codes instead of publishing complete responses.

To disable the feature, remove **both** public config variables and rebuild through your usual reviewed release process. Public browsing continues; existing private database rows remain. For a code rollback, revert the feature commits on a separately reviewed branch. Do not drop the table as an automatic rollback; export/retain data under the operator's normal private backup policy before any intentional deletion. Deleting an Auth user cascades to their personal answers.

A user can revoke the app under GitHub **Settings → Applications → Authorized OAuth Apps**, and sign out in the site. For all devices, revoke Supabase sessions using its administrative dashboard/session controls; local site logout alone covers only the current session. GitHub grant revocation alone does not necessarily invalidate an existing Supabase session. Supabase access JWTs can remain valid until expiry after refresh-token revocation. If a secret or token was exposed, revoke/rotate it in the issuing service, invalidate affected Supabase sessions, inspect access/audit records, and remove leaked logs/artifacts/history as appropriate. Removing the latest Git commit is insufficient. OAuth secret rotation belongs in GitHub and Supabase dashboards, never in client code.

References: [Supabase GitHub login](https://supabase.com/docs/guides/auth/social-login/auth-github), [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
