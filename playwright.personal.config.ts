import {defineConfig, devices} from '@playwright/test';
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '') + '/';
const preview = process.env.TEST_PREVIEW === '1';
export default defineConfig({
 testDir: 'tests/e2e', testMatch: 'personal-answers.spec.ts', timeout: 30000,
 use: {baseURL: 'http://127.0.0.1:4323', trace: 'retain-on-failure'},
 projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
 webServer: {
  command: preview ? 'npm run preview -- --port 4323 --ignore-lock' : 'npm run dev -- --port 4323 --ignore-lock',
  url: `http://127.0.0.1:4323${base}en/questions/Q0001/`, reuseExistingServer: false, timeout: 30000,
  env: {ASTRO_TELEMETRY_DISABLED:'1', PUBLIC_SUPABASE_URL:'https://example.supabase.co', PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_only'},
 },
});
