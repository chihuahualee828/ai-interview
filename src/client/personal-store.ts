import type {SupabaseClient} from '@supabase/supabase-js';
import type {Locale} from '../lib/types';
export type AnswerKey = {user_id: string; question_id: string; locale: Locale};
export type Answer = {body: string; updated_at: string};
export interface AnswerStore {
 load(key: AnswerKey, signal: AbortSignal): Promise<Answer | null>;
 save(key: AnswerKey, body: string, signal: AbortSignal): Promise<Answer>;
 remove(key: AnswerKey, signal: AbortSignal): Promise<void>;
}
export function answerStore(client: SupabaseClient): AnswerStore {
 const table = () => client.from('personal_answers');
 return {
  async load(key, signal) {
   const {data, error, status} = await table().select('body,updated_at').eq('user_id', key.user_id).eq('question_id', key.question_id).eq('locale', key.locale).abortSignal(signal).maybeSingle();
   if (error) throw Object.assign(error, {status});
   return data;
  },
  async save(key, body, signal) {
   const {data, error, status} = await table().upsert({...key, body}, {onConflict: 'user_id,question_id,locale'}).eq('user_id', key.user_id).eq('question_id', key.question_id).eq('locale', key.locale).select('body,updated_at').abortSignal(signal).single();
   if (error) throw Object.assign(error, {status});
   return data;
  },
  async remove(key, signal) {
   const {error, status} = await table().delete().eq('user_id', key.user_id).eq('question_id', key.question_id).eq('locale', key.locale).abortSignal(signal);
   if (error) throw Object.assign(error, {status});
  },
 };
}
