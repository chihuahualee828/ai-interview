# Personal-answer database

Apply `migrations/202610180001_personal_answers.sql` once in your Supabase SQL editor; builds never apply migrations. Review the grants, four owner-only RLS policies, server timestamp trigger, and cascading user deletion before applying it.

Full GitHub OAuth, Supabase, public build-variable, security acceptance and recovery instructions: [personal-answer sync guide](../docs/personal-answer-sync.md).

Run `tests/personal_answers_rls.sql` only in a disposable test project. It impersonates authenticated A/B and anonymous SQL roles, creates synthetic users inside a transaction and rolls everything back. Follow the guide's additional two-account REST tests with real login sessions before release.
