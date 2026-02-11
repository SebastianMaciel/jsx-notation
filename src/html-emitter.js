/**
 * Walk an HTML tree (from html-parser.js) and emit JSXN notation.
 *
 * @param {object[]} roots - Array of HtmlNode from parseHTML
 * @param {object} aliases - { props: Map, classes: Map } (no components for HTML)
 * @returns {string} JSXN output
 */
export function emitHTML(roots, aliases) {
  const propAlias = aliases?.props ?? new Map();
  const classAlias = aliases?.classes ?? new Map();
  const lines = [];

  for (const node of roots) {
    emitNode(node, 0, lines, propAlias, classAlias);
  }

  return lines.join('\n');
}

function indent(level) {
  return ' '.repeat(level);
}

function emitNode(node, level, lines, propAlias, classAlias) {
  // Text node
  if (node.text !== undefined) {
    const text = node.text.trim();
    if (text) lines.push(`${indent(level)}"${text}"`);
    return;
  }

  const { tag, attrs, children } = node;

  let classNames = null;
  let idValue = null;
  const otherAttrs = [];

  for (const attr of attrs) {
    if (attr.name === 'class') {
      classNames = attr.value || '';
      continue;
    }
    if (attr.name === 'id') {
      idValue = attr.value || '';
      continue;
    }
    otherAttrs.push(attr);
  }

  // Build tag line — implicit div when tag is div with class/id
  const hasSelector = idValue !== null || classNames !== null;
  let line = (tag === 'div' && hasSelector) ? '' : tag;

  // Append #id
  if (idValue !== null) {
    line += `#${idValue}`;
  }

  // Append .classes (applying class aliases)
  if (classNames !== null) {
    const classes = classNames.split(/\s+/).filter(Boolean);
    for (const cls of classes) {
      line += `.${classAlias.get(cls) ?? cls}`;
    }
  }

  // Append other attrs
  const propsStr = formatAttrs(otherAttrs, propAlias);
  if (propsStr) {
    line += ` ${propsStr}`;
  }

  // Process children
  const sigChildren = children.filter(c => {
    if (c.text !== undefined) return c.text.trim().length > 0;
    return true;
  });

  if (sigChildren.length === 0) {
    lines.push(`${indent(level)}${line}`);
  } else if (sigChildren.length === 1 && isInlineChild(sigChildren[0])) {
    const child = sigChildren[0];
    const text = child.text.trim();
    lines.push(`${indent(level)}${line} "${text}"`);
  } else {
    lines.push(`${indent(level)}${line}`);
    for (const child of sigChildren) {
      emitNode(child, level + 1, lines, propAlias, classAlias);
    }
  }
}

function isInlineChild(child) {
  // Only text nodes can be inline
  return child.text !== undefined;
}

function formatAttrs(attrs, propAlias) {
  if (attrs.length === 0) return '';
  const parts = [];
  for (const attr of attrs) {
    const alias = propAlias.get(attr.name) ?? attr.name;
    if (attr.value === null) {
      // Boolean attribute
      parts.push(alias);
    } else if (attr.value.includes(',')) {
      // Quote values containing commas to avoid delimiter confusion
      parts.push(`${alias}:"${attr.value}"`);
    } else {
      parts.push(`${alias}:${attr.value}`);
    }
  }
  return `{${parts.join(', ')}}`;
}
