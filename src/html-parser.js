/**
 * Lightweight HTML parser — zero dependencies.
 * Produces a simple tree: { doctype, roots: HtmlNode[] }
 *
 * HtmlNode = { tag, attrs: [{name, value}], children: HtmlNode[] }
 *           | { text: string }
 *
 * @param {string} html
 * @returns {{ doctype: string|null, roots: HtmlNode[] }}
 */
export function parseHTML(html) {
  const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
  ]);

  const RAW_ELEMENTS = new Set(['script', 'style']);

  let pos = 0;
  let doctype = null;
  const roots = [];
  const stack = []; // open element nodes

  function current() { return stack.length > 0 ? stack[stack.length - 1] : null; }
  function addChild(node) {
    const parent = current();
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  while (pos < html.length) {
    if (html[pos] === '<') {
      // Comment: <!-- ... -->
      if (html.startsWith('<!--', pos)) {
        const end = html.indexOf('-->', pos + 4);
        pos = end === -1 ? html.length : end + 3;
        continue;
      }

      // DOCTYPE: <!DOCTYPE ...>
      if (/^<!doctype\s/i.test(html.slice(pos, pos + 11))) {
        const end = html.indexOf('>', pos);
        if (end !== -1) {
          doctype = html.slice(pos + 2, end).trim();
          pos = end + 1;
        } else {
          pos = html.length;
        }
        continue;
      }

      // Closing tag: </tag>
      if (pos + 1 < html.length && html[pos + 1] === '/') {
        const end = html.indexOf('>', pos + 2);
        if (end === -1) { pos = html.length; continue; }
        const closeTag = html.slice(pos + 2, end).trim().toLowerCase();
        pos = end + 1;

        // Pop stack to matching open tag
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tag === closeTag) {
            stack.length = i; // pop down to (not including) the matched element
            break;
          }
        }
        continue;
      }

      // Opening tag: <tag ...>
      pos++; // skip <
      const tagStart = pos;
      while (pos < html.length && !/[\s/>]/.test(html[pos])) pos++;
      const tag = html.slice(tagStart, pos).toLowerCase();

      if (!tag) continue;

      // Parse attributes
      const attrs = parseAttrs();

      // Check for self-closing />
      const selfClose = pos < html.length && html[pos] === '/';
      if (selfClose) pos++;
      if (pos < html.length && html[pos] === '>') pos++;

      const node = { tag, attrs, children: [] };
      const isVoid = VOID_ELEMENTS.has(tag);

      addChild(node);

      if (!isVoid && !selfClose) {
        stack.push(node);
      }

      // Raw content elements (script, style)
      if (RAW_ELEMENTS.has(tag) && !selfClose && !isVoid) {
        const closePattern = new RegExp(`</${tag}\\s*>`, 'i');
        const match = closePattern.exec(html.slice(pos));
        if (match) {
          const rawContent = html.slice(pos, pos + match.index);
          if (rawContent.trim()) {
            node.children.push({ text: rawContent });
          }
          pos = pos + match.index + match[0].length;
          // Pop from stack since we consumed the closing tag
          if (stack.length > 0 && stack[stack.length - 1] === node) {
            stack.pop();
          }
        }
      }
    } else {
      // Text node — read until next <
      const textStart = pos;
      while (pos < html.length && html[pos] !== '<') pos++;
      const rawText = html.slice(textStart, pos);
      const text = rawText.replace(/\s+/g, ' ').trim();
      if (text) {
        addChild({ text });
      }
    }
  }

  return { doctype, roots };

  function parseAttrs() {
    const attrs = [];
    while (pos < html.length) {
      while (pos < html.length && /\s/.test(html[pos])) pos++;
      if (pos >= html.length || html[pos] === '>' || html[pos] === '/') break;

      // Attribute name
      const nameStart = pos;
      while (pos < html.length && !/[\s=/>]/.test(html[pos])) pos++;
      const name = html.slice(nameStart, pos);
      if (!name) { pos++; continue; }

      while (pos < html.length && /\s/.test(html[pos])) pos++;

      if (pos < html.length && html[pos] === '=') {
        pos++; // skip =
        while (pos < html.length && /\s/.test(html[pos])) pos++;

        let value = '';
        if (pos < html.length && (html[pos] === '"' || html[pos] === "'")) {
          const quote = html[pos];
          pos++;
          const valStart = pos;
          while (pos < html.length && html[pos] !== quote) pos++;
          value = html.slice(valStart, pos);
          if (pos < html.length) pos++;
        } else {
          const valStart = pos;
          while (pos < html.length && !/[\s>]/.test(html[pos])) pos++;
          value = html.slice(valStart, pos);
        }
        attrs.push({ name, value });
      } else {
        // Boolean attribute (no value)
        attrs.push({ name, value: null });
      }
    }
    return attrs;
  }
}
