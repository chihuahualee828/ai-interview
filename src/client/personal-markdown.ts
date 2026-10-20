import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, {defaultSchema} from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import type {Nodes, Root} from 'mdast';

// Keep pasted HTML literal, and images as alt text: displaying a private note
// must never fetch a third-party image or interpret executable user markup.
function privateContent() {
 return (tree: Root) => {
  function visit(node: Nodes) {
   if (!('children' in node)) return;
   node.children = node.children.map(child => {
    if (child.type === 'html') return {type: 'text', value: child.value};
    if (child.type === 'image' || child.type === 'imageReference') return {type: 'text', value: child.alt ?? ''};
    visit(child);
    return child;
   }) as typeof node.children;
  }
  visit(tree);
 };
}

const markdown = unified().use(remarkParse).use(remarkMath).use(privateContent)
 .use(remarkRehype).use(rehypeSanitize, {
  ...defaultSchema,
  tagNames: defaultSchema.tagNames!.filter(tag => tag !== 'img'),
  attributes: {...defaultSchema.attributes, code: [['className', /^language-./, 'math-inline', 'math-display']]},
 }).use(rehypeKatex, {trust: false, strict: 'error', maxExpand: 1000, maxSize: 20})
 .use(rehypeStringify);

/** Sanitized HTML only; source Markdown remains the sole value saved to Supabase. */
export function renderPersonalMarkdown(value: string): string {
 return String(markdown.processSync(value));
}
