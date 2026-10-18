-- Run ONLY against a disposable Supabase test project after applying the migration.
-- Uses synthetic auth users and rolls everything back. No real credentials needed.
-- Run as the SQL editor's postgres role. Any exception is a failed assertion.
begin;
insert into auth.users (id, aud, role, email) values
 ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rls-a@example.invalid'),
 ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rls-b@example.invalid');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.personal_answers (user_id, question_id, locale, body)
 values ('10000000-0000-4000-8000-000000000001', 'Q0001', 'en', 'A private');
-- Exercise exactly the column set PostgREST uses for upsert.
insert into public.personal_answers (user_id, question_id, locale, body)
 values ('10000000-0000-4000-8000-000000000001', 'Q0001', 'en', 'A edited')
 on conflict (user_id, question_id, locale) do update
 set user_id=excluded.user_id, question_id=excluded.question_id, locale=excluded.locale, body=excluded.body;

do $$ begin
 if (select body from public.personal_answers where question_id='Q0001' and locale='en') is distinct from 'A edited' then raise exception 'Own upsert/read failed'; end if;
 begin
  insert into public.personal_answers (user_id, question_id, locale, body)
   values ('10000000-0000-4000-8000-000000000002','Q0002','en','forged');
  raise exception 'Cross-user insert allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.personal_answers set user_id='10000000-0000-4000-8000-000000000002';
  raise exception 'Ownership change allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.personal_answers (user_id, question_id, locale, body)
   values ('10000000-0000-4000-8000-000000000001','Q0002','en',repeat('x',30001));
  raise exception 'Oversize answer allowed';
 exception when check_violation then null; end;
 begin
  update public.personal_answers set updated_at='2000-01-01';
  raise exception 'Client timestamp allowed';
 exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$ declare affected integer; begin
 if exists(select 1 from public.personal_answers) then raise exception 'B can read A'; end if;
 update public.personal_answers set body='stolen' where user_id='10000000-0000-4000-8000-000000000001';
 get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'B can update A'; end if;
 delete from public.personal_answers where user_id='10000000-0000-4000-8000-000000000001';
 get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'B can delete A'; end if;
 begin
  insert into public.personal_answers (user_id, question_id, locale, body)
   values ('10000000-0000-4000-8000-000000000001','Q0001','en','stolen')
   on conflict (user_id, question_id, locale) do update set body=excluded.body;
  raise exception 'B can upsert A';
 exception when insufficient_privilege then null; end;
end $$;
insert into public.personal_answers (user_id, question_id, locale, body)
 values ('10000000-0000-4000-8000-000000000002','Q0001','en','B private');
update public.personal_answers set body='B edited';
delete from public.personal_answers where user_id='10000000-0000-4000-8000-000000000002';

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$ begin
 if (select body from public.personal_answers) is distinct from 'A edited' then raise exception 'A was modified by B'; end if;
end $$;
delete from public.personal_answers where user_id='10000000-0000-4000-8000-000000000001';

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
 begin
  perform * from public.personal_answers;
  raise exception 'Anonymous read allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.personal_answers (user_id, question_id, locale, body)
   values ('10000000-0000-4000-8000-000000000001','Q0001','en','anonymous');
  raise exception 'Anonymous insert allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.personal_answers set body='anonymous';
  raise exception 'Anonymous update allowed';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.personal_answers;
  raise exception 'Anonymous delete allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
