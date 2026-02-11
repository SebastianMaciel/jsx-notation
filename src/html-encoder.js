import { parseHTML } from './html-parser.js';
import { generateAliases, formatHeaders } from './alias.js';
import { emitHTML } from './html-emitter.js';

/**
 * Encode HTML source into JSXN notation.
 *
 * @param {string} html - HTML source code
 * @returns {string} JSXN notation
 */
export function encodeHTML(html) {
  const { doctype, roots } = parseHTML(html);

  // Analyze frequencies from the tree (inline, no Babel needed)
  const frequencies = analyzeHTML(roots);
  const aliases = generateAliases(frequencies);
  const headers = formatHeaders(aliases);
  const body = emitHTML(roots, aliases);

  const parts = [];

  if (doctype) {
    parts.push(`!${doctype}`);
  }

  if (headers) {
    parts.push(headers);
  }

  if (parts.length > 0 && body) {
    parts.push('');
  }

  parts.push(body);

  return parts.join('\n');
}

/**
 * Count attribute and class frequencies from an HTML tree.
 */
function analyzeHTML(roots) {
  const props = new Map();
  const classes = new Map();
  const components = new Map(); // always empty for HTML

  function walk(nodes) {
    for (const node of nodes) {
      if (node.text !== undefined) continue;

      for (const attr of node.attrs) {
        if (attr.name === 'class') {
          if (attr.value) {
            for (const cls of attr.value.split(/\s+/).filter(Boolean)) {
              classes.set(cls, (classes.get(cls) ?? 0) + 1);
            }
          }
          continue;
        }
        if (attr.name === 'id') continue;

        props.set(attr.name, (props.get(attr.name) ?? 0) + 1);
      }

      if (node.children) walk(node.children);
    }
  }

  walk(roots);
  return { components, props, classes };
}
