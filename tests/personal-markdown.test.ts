import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {renderPersonalMarkdown} from '../src/client/personal-markdown';
const render = (source: string) => parseHTML(`<html><body>${renderPersonalMarkdown(source)}</body></html>`).document.body;

test('private notes render Markdown, code, Unicode, inline and block math', () => {
 const body = render('## 思路\n\n**Attention** and $O(n^2)$\n\n- α → β\n- `x_i`\n\n```python\nx < y\n```\n\n$$\n\\frac{QK^T}{\\sqrt{d_k}}\n$$');
 assert.equal(body.querySelector('h2')?.textContent,'思路');
 assert.equal(body.querySelector('strong')?.textContent,'Attention');
 assert.equal(body.querySelectorAll('li').length,2);
 assert.match(body.querySelector('pre code')!.textContent!,/x < y/);
 assert.equal(body.querySelectorAll('.katex').length,2);
 assert.equal(body.querySelectorAll('.katex-display').length,1);
});
test('HTML, scripts, embeds, and image URLs cannot become active note content', () => {
 const source='<img src="https://tracker.invalid/pixel" onerror="alert(1)">\n\n<script>alert(1)</script>\n\n<iframe src="https://tracker.invalid"></iframe>\n\n![diagram](https://tracker.invalid/image)\n\n![reference][img]\n\n[img]: https://tracker.invalid/ref';
 const body=render(source);
 assert.equal(body.querySelectorAll('img,script,iframe,svg,object,embed,style').length,0);
 assert.match(body.textContent!,/<img src=/);
 assert.match(body.textContent!,/diagram/);
 assert.match(body.textContent!,/reference/);
 assert.equal(body.querySelectorAll('[onerror],[onclick]').length,0);
});
test('dangerous Markdown URLs and trusted-only math commands are blocked', () => {
 const body=render('[safe](https://example.com) [bad](javascript:alert%281%29) [data](data:text/html,boom)\n\n$\\href{javascript:alert(1)}{click}$\n\n$\\includegraphics{https://tracker.invalid/math}$\n\n$\\htmlClass{evil}{x}$');
 const hrefs=[...body.querySelectorAll('[href]')].map(a=>a.getAttribute('href'));
 assert.deepEqual(hrefs,['https://example.com']);
 assert.equal(body.querySelectorAll('img,.evil,[src]').length,0);
});
test('unfinished math and legacy plain text remain readable without throwing or mutating source', () => {
 const source='Use <T> and a < b.\n\n$\\frac{unfinished$';
 const body=render(source);
 assert.match(body.textContent!,/Use <T> and a < b/);
 assert.match(body.textContent!,/unfinished/);
 assert.equal(source,'Use <T> and a < b.\n\n$\\frac{unfinished$');
});
