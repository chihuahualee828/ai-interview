import { defineConfig } from 'astro/config';
import {publicConfig} from './src/client/personal-security.ts';
export default defineConfig({
 vite: {plugins: [{name: 'validate-public-sync-config', configResolved(config) {
  const url = config.env.PUBLIC_SUPABASE_URL, key = config.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Validate before Vite can substitute an accidentally supplied private key. Never print values.
  if ((url || key) && !publicConfig(url, key)) throw new Error('Personal sync requires a hosted Supabase HTTPS URL and a publishable/anon key. Remove both variables to disable it.');
 }}]},
 output: 'static', site: process.env.SITE_URL || 'http://localhost:4321',
 base: process.env.BASE_PATH || '/', trailingSlash: 'always',
 build: { inlineStylesheets: 'never' }, devToolbar: { enabled: false }
});
