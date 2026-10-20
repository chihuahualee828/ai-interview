# Personal note editor

The GitHub account controls sit at the top right of the study page. Personal answers open as rendered notes, separate from the public reference answer and community contribution controls.

## Using notes

- Sign in, then double-click the note section or choose **Edit note**. Keyboard users can focus the preview and press Enter or Space; touch users can use the Edit button.
- **Ctrl/Cmd+Enter** or the **Save & close** button saves the source text to Supabase and renders the note. **Ctrl/Cmd+S**, while focus is in the textarea, saves without closing the editor. The editor closes after the server acknowledges the save. **Enter** and **Shift+Enter** insert newlines. Typing, waiting, and leaving the field do not save or render the draft.
- Drag the handle below the note to change its height; keyboard users can focus it and use Up/Down (Home/End for the limits). Long notes scroll inside this area, while save controls stay outside it. The height is shared between edit and rendered modes.
- Height is a device-local layout preference in localStorage, scoped to Supabase project, site base path, account, question, and language. Only a pixel height is stored—never note text. Clearing browser storage resets it. A different browser/device can use a different height; no Supabase migration is needed.
- Revealing the reference answer opens it below personal notes and scrolls to it, respecting reduced-motion preferences. Rendered personal notes blend into the section background; the textarea retains its white background.
- **Escape** or **Cancel** restores the saved text, with confirmation when there are unsaved changes. Save errors keep the draft open for retry. Unsaved changes still trigger the existing navigation warning.
- Notes support Markdown headings, emphasis, lists, quotes, code, links, Unicode symbols, inline math with `$...$`, and display math with `$$` on separate lines. For example:

````markdown
## My reasoning

- Attention costs $O(n^2)$.
- Compare compute and memory costs.

$$
\mathrm{Attention}(Q,K,V) = \mathrm{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V
$$

```python
scores = Q @ K.T / sqrt(d_k)
```
````

There is no database migration, new dependency, or new environment variable. Existing notes remain editable as their original source text. The current Supabase OAuth callback allowlist and owner-only RLS policies still apply; see [setup and security checks](personal-answer-sync.md).

## Rendering and privacy

Formatting runs in the browser using bundled Markdown and KaTeX libraries, loaded when a nonempty note needs rendering. Only the original source text is persisted to Supabase; the numeric height preference stays in localStorage. Preview HTML is sanitized before math rendering; KaTeX trust is disabled and expansion/size limits are set. Raw HTML displays as text, images become alt text, and unsafe link protocols are removed. Preview links use `noopener noreferrer`. This follows the [rehype-sanitize math guidance](https://github.com/rehypejs/rehype-sanitize#example-math) and [KaTeX options](https://katex.org/docs/options).

Malformed math remains readable. If the renderer fails to load, a plain-text fallback preserves the note. Signing out or switching accounts clears both editor and preview; a delayed renderer import cannot restore content from the previous session. No extra OAuth scopes, token persistence mechanisms, privileged database credentials, or public contribution writes are introduced.

## Validation — 2026-10-20

- Unit tests: **67 passed**, including explicit-save controller behavior and Markdown/math security tests.
- Personal-note browser suite: **19 passed** in development and **19 passed** against the production build at `/ai-interview/`, using synthetic Supabase sessions and mocked requests.
- Data validation: **598 questions, 226 answers, 110 sources, 3 locales**.
- Type check: **0 errors, 0 warnings**; two compatibility deprecation hints (`beforeunload.returnValue` and the IME `keyCode === 229` fallback).
- Production build: **1,799 pages**, with synthetic public Supabase configuration.
- Prior full public study/contribution browser suite comparison: **15 passed, 6 failed**. An isolated export of unchanged `main` (`54965e0`) produced the same 15 passes and six failures with the same installed dependencies. Failures concern company/topic filter checkbox navigation, the reference-answer subscript fixture, and three locale-specific reference-title formula fixtures. No assertions were removed or disabled.
- Visual inspection: desktop header, rendered math/code note, editor, and mobile layout. Automated layout checks cover all three languages at 320px width.

The personal tests also cover Ctrl/Cmd+Enter, Ctrl/Cmd+S, scoped shortcut handling, per-account/question/locale height persistence, pointer and keyboard resizing, invalid/full preference storage, scrolling inside notes, and reference-answer reveal scrolling with reduced motion. They cover no writes while typing/blur/waiting; Enter/Shift+Enter inserting newlines without saving/rendering; IME and held-Enter handling; cancellation; save acknowledgement and duplicate submissions; load/save failure recovery; cross-account and logout clearing; delayed-render privacy; unsafe HTML/links/images; PKCE callback and scopes; and existing token-scrubbing behavior.

Live Supabase writes, RLS enforcement, GitHub authorization, and real OS-level Chinese/Japanese IME input were not exercised. Browser tests use Chromium and synthetic composition events. Before release, manually check real IME input, mobile keyboards/Safari, and the deployed OAuth round trip with the existing Supabase setup. Nothing was pushed, merged, or deployed as part of this implementation.
