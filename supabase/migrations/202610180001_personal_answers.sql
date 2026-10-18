begin;

create table public.personal_answers (
 user_id uuid not null references auth.users(id) on delete cascade,
 question_id text not null check (question_id ~ '^Q[0-9]{4,}$'),
 locale text not null check (locale in ('en', 'zh-TW', 'ja')),
 body text not null check (char_length(body) <= 30000),
 updated_at timestamptz not null default now(),
 primary key (user_id, question_id, locale)
);

create function public.set_personal_answer_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
 new.updated_at = now();
 return new;
end;
$$;
create trigger trg_personal_answers_updated_at
before insert or update on public.personal_answers
for each row execute function public.set_personal_answer_updated_at();

alter table public.personal_answers enable row level security;
alter table public.personal_answers force row level security;
revoke all on public.personal_answers from public, anon, authenticated;
grant select, delete on public.personal_answers to authenticated;
grant insert (user_id, question_id, locale, body), update (body) on public.personal_answers to authenticated;
-- PostgREST upsert updates all supplied columns; policies also prevent moving ownership.
grant update (user_id, question_id, locale) on public.personal_answers to authenticated;
revoke all on function public.set_personal_answer_updated_at() from public, anon, authenticated;

create policy "read own answers" on public.personal_answers
 for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own answers" on public.personal_answers
 for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own answers" on public.personal_answers
 for update to authenticated using ((select auth.uid()) = user_id)
 with check ((select auth.uid()) = user_id);
create policy "delete own answers" on public.personal_answers
 for delete to authenticated using ((select auth.uid()) = user_id);

commit;
