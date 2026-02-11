/**
 * Decode JSXN snippet notation back into JSX or HTML.
 * No Babel dependency — line-based text parsing only.
 *
 * @param {string} jsxn - JSXN notation string
 * @param {object} [options] - { format: 'jsx' | 'html' }
 * @returns {string} JSX or HTML output
 */
export function decode(jsxn, options = {}) {
  const format = options.format || 'jsx';
  if (!jsxn || !jsxn.trim()) return '';

  const lines = jsxn.split('\n');

  // Pass 1: Parse alias headers, collect body lines, detect DOCTYPE
  const reverseComp = new Map();
  const reverseProp = new Map();
  const reverseClass = new Map();
  const bodyLines = [];
  let hasDoctype = false;

  for (const line of lines) {
    if (line.startsWith('@C ')) {
      parseAliasHeader(line.slice(3), reverseComp);
    } else if (line.startsWith('@P ')) {
      parseAliasHeader(line.slice(3), reverseProp);
    } else if (line.startsWith('@S ')) {
      parseAliasHeader(line.slice(3), reverseClass);
    } else if (line.trim().startsWith('!DOCTYPE') || line.trim().startsWith('!doctype')) {
      hasDoctype = true;
    } else {
      bodyLines.push(line);
    }
  }

  // Skip leading/trailing blank lines in body
  while (bodyLines.length > 0 && bodyLines[0].trim() === '') bodyLines.shift();
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') bodyLines.pop();

  if (bodyLines.length === 0) return hasDoctype && format === 'html' ? '<!DOCTYPE html>' : '';

  // Pass 2: Build tree from indentation
  const ctx = { reverseComp, reverseProp, reverseClass };
  const roots = buildTree(bodyLines, ctx);

  // Pass 3: Emit
  const output = [];
  if (format === 'html' && hasDoctype) {
    output.push('<!DOCTYPE html>');
  }
  const emitFn = format === 'html' ? emitHTMLNode : emitJSX;
  for (const node of roots) {
    emitFn(node, 0, output);
  }
  return output.join('\n');
}

// ---------------------------------------------------------------------------
// Alias parsing
// ---------------------------------------------------------------------------

function parseAliasHeader(str, map) {
  // "Button=B, Modal=M" → map: B→Button, M→Modal
  const entries = str.split(',');
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const fullName = trimmed.slice(0, eq).trim();
    const alias = trimmed.slice(eq + 1).trim();
    map.set(alias, fullName);
  }
}

// ---------------------------------------------------------------------------
// Tree building
// ---------------------------------------------------------------------------

function buildTree(lines, ctx) {
  const roots = [];
  const stack = []; // { node, indent }

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trimStart();
    const lineIndent = rawLine.length - rawLine.trimStart().length;

    if (trimmed === '') { i++; continue; }

    const node = classifyAndParse(trimmed, ctx);
    node.children = [];

    // Pop stack to find parent
    while (stack.length > 0 && stack[stack.length - 1].indent >= lineIndent) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }

    stack.push({ node, indent: lineIndent });

    // For ? and * nodes, push the inline child onto the stack
    // so subsequent indented continuation lines become its children
    if (node.type === 'conditional' || node.type === 'map') {
      const inlineChild = node.child;
      if (inlineChild && inlineChild.type === 'element') {
        stack.push({ node: inlineChild, indent: lineIndent + 1 });
      }
    }
    i++;
  }

  return roots;
}

// ---------------------------------------------------------------------------
// Line classification and parsing
// ---------------------------------------------------------------------------

function classifyAndParse(trimmed, ctx) {
  // Fragment
  if (trimmed === '_') {
    return { type: 'fragment' };
  }

  // Ternary: ?cond > A | B
  if (trimmed.startsWith('?') && trimmed.includes('>') && trimmed.includes('|')) {
    return parseTernary(trimmed, ctx);
  }

  // Conditional: ?cond > X
  if (trimmed.startsWith('?') && trimmed.includes('>')) {
    return parseConditional(trimmed, ctx);
  }

  // Map: *coll > X
  if (trimmed.startsWith('*') && trimmed.includes('>')) {
    return parseMap(trimmed, ctx);
  }

  // Text: "..."
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return { type: 'text', value: trimmed.slice(1, -1) };
  }

  // Expression: (...)
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    return { type: 'expression', value: trimmed.slice(1, -1) };
  }

  // Element (default)
  return parseElement(trimmed, ctx);
}

function parseTernary(trimmed, ctx) {
  // ?cond > ConsTag {...} | AltTag {...}
  const afterQ = trimmed.slice(1);
  const gtIdx = afterQ.indexOf('>');
  const condition = afterQ.slice(0, gtIdx).trim();
  const rest = afterQ.slice(gtIdx + 1).trim();

  // Split on | that's not inside braces
  const pipeIdx = findUnbraced(rest, '|');
  const consStr = rest.slice(0, pipeIdx).trim();
  const altStr = rest.slice(pipeIdx + 1).trim();

  const consNode = classifyAndParse(consStr, ctx);
  consNode.children = consNode.children || [];
  const altNode = classifyAndParse(altStr, ctx);
  altNode.children = altNode.children || [];

  return {
    type: 'ternary',
    condition,
    consequent: consNode,
    alternate: altNode,
  };
}

function parseConditional(trimmed, ctx) {
  // ?cond > Element {props} "text"
  const afterQ = trimmed.slice(1);
  const gtIdx = afterQ.indexOf('>');
  const condition = afterQ.slice(0, gtIdx).trim();
  const rest = afterQ.slice(gtIdx + 1).trim();

  const childNode = classifyAndParse(rest, ctx);
  childNode.children = childNode.children || [];

  return {
    type: 'conditional',
    condition,
    child: childNode,
  };
}

function parseMap(trimmed, ctx) {
  // *collection > Element {props}
  const afterStar = trimmed.slice(1);
  const gtIdx = afterStar.indexOf('>');
  const collection = afterStar.slice(0, gtIdx).trim();
  const rest = afterStar.slice(gtIdx + 1).trim();

  const childNode = classifyAndParse(rest, ctx);
  childNode.children = childNode.children || [];

  const param = singularize(collection);

  return {
    type: 'map',
    collection,
    param,
    child: childNode,
  };
}

function parseElement(trimmed, ctx) {
  let pos = 0;
  let tag = '';
  let id = null;
  let classes = [];
  const props = [];
  let inlineChild = null;

  // Check if starts with selector (implicit div)
  if (trimmed[0] === '.' || trimmed[0] === '#') {
    tag = 'div';
  } else {
    // Read tag name. Check for member expression: Tag.SubTag (dot + uppercase = member)
    while (pos < trimmed.length && trimmed[pos] !== '#' && trimmed[pos] !== ' ' && trimmed[pos] !== '{') {
      if (trimmed[pos] === '.') {
        // Dot followed by uppercase → member expression (Form.Input), keep reading
        if (pos + 1 < trimmed.length && /[A-Z]/.test(trimmed[pos + 1])) {
          pos++;
          continue;
        }
        // Dot followed by lowercase or { → class selector, stop here
        break;
      }
      pos++;
    }
    tag = trimmed.slice(0, pos);
  }

  // Resolve component alias
  tag = ctx.reverseComp.get(tag) || tag;

  // Check for member expression: don't treat dots as class selectors
  const isMemberExpr = tag.includes('.');

  // Parse selectors (. and #)
  if (!isMemberExpr) {
    while (pos < trimmed.length && (trimmed[pos] === '.' || trimmed[pos] === '#')) {
      if (trimmed[pos] === '#') {
        pos++;
        if (trimmed[pos] === '{') {
          // Dynamic id: #{expr}
          pos++; // skip {
          const end = findBalancedBrace(trimmed, pos - 1);
          id = { type: 'expression', value: trimmed.slice(pos, end) };
          pos = end + 1;
        } else {
          const start = pos;
          while (pos < trimmed.length && trimmed[pos] !== '.' && trimmed[pos] !== '#' && trimmed[pos] !== ' ' && trimmed[pos] !== '{') pos++;
          id = { type: 'string', value: trimmed.slice(start, pos) };
        }
      } else if (trimmed[pos] === '.') {
        pos++;
        if (trimmed[pos] === '{') {
          // Dynamic class: .{expr}
          pos++; // skip {
          const end = findBalancedBrace(trimmed, pos - 1);
          classes.push({ type: 'expression', value: trimmed.slice(pos, end) });
          pos = end + 1;
        } else {
          const start = pos;
          while (pos < trimmed.length && trimmed[pos] !== '.' && trimmed[pos] !== '#' && trimmed[pos] !== ' ' && trimmed[pos] !== '{') pos++;
          const cls = trimmed.slice(start, pos);
          // Resolve class alias
          classes.push({ type: 'string', value: ctx.reverseClass.get(cls) || cls });
        }
      }
    }
  }

  // Skip whitespace
  while (pos < trimmed.length && trimmed[pos] === ' ') pos++;

  // Parse props block: {...}
  if (pos < trimmed.length && trimmed[pos] === '{') {
    // Check if this is a props block or an inline child expression
    // Props block: {key:val, ...} — inline child would be after tag+selectors+props
    const end = findBalancedBrace(trimmed, pos);
    const block = trimmed.slice(pos + 1, end);
    if (looksLikeProps(block)) {
      parsePropsBlock(block, props, ctx);
      pos = end + 1;
      // Skip whitespace after props
      while (pos < trimmed.length && trimmed[pos] === ' ') pos++;
    }
  }

  // Parse inline child: "text" or (expr)
  if (pos < trimmed.length) {
    const rest = trimmed.slice(pos);
    if (rest.startsWith('"') && rest.endsWith('"')) {
      inlineChild = { type: 'text', value: rest.slice(1, -1) };
    } else if (rest.startsWith('(') && rest.endsWith(')')) {
      inlineChild = { type: 'expression', value: rest.slice(1, -1) };
    }
  }

  return {
    type: 'element',
    tag,
    id,
    classes,
    props,
    inlineChild,
    children: [],
  };
}

// ---------------------------------------------------------------------------
// Props parsing
// ---------------------------------------------------------------------------

const STRING_PROPS = new Set([
  'type', 'placeholder', 'href', 'src', 'alt', 'name', 'role',
  'target', 'rel', 'method', 'action', 'htmlFor', 'autoComplete',
  // SVG attributes
  'd', 'viewBox', 'transform', 'points', 'fill', 'stroke', 'xmlns',
  'preserveAspectRatio', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'font-family', 'font-size', 'font-weight', 'text-anchor',
  'opacity', 'rx', 'ry', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'width', 'height', 'dx', 'dy', 'offset', 'stop-color', 'stop-opacity',
]);

function looksLikeProps(block) {
  // Heuristic: a props block has key:val pairs or flags or ...spread
  // A bare expression would not contain unquoted colons at the top level
  if (block.startsWith('...')) return true;
  // Check for key:value pattern or bare identifier (flag)
  const parts = splitProps(block);
  for (const part of parts) {
    const t = part.trim();
    if (!t) continue;
    if (t.startsWith('...')) return true;
    if (/^[a-zA-Z_$]/.test(t)) return true;
  }
  return false;
}

function parsePropsBlock(block, props, ctx) {
  const parts = splitProps(block);
  for (const part of parts) {
    const t = part.trim();
    if (!t) continue;

    if (t.startsWith('...')) {
      props.push({ type: 'spread', value: t.slice(3) });
      continue;
    }

    const colonIdx = t.indexOf(':');
    if (colonIdx === -1) {
      // Boolean prop flag
      const name = ctx.reverseProp.get(t) || t;
      props.push({ type: 'boolean', name });
      continue;
    }

    const key = t.slice(0, colonIdx);
    let val = t.slice(colonIdx + 1);
    // Strip enclosing quotes (used when value contains commas)
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    const name = ctx.reverseProp.get(key) || key;

    if (STRING_PROPS.has(name) && isSimpleStringValue(val)) {
      props.push({ type: 'string', name, value: val });
    } else {
      props.push({ type: 'expression', name, value: val });
    }
  }
}

function splitProps(block) {
  // Split by comma, respecting balanced braces/parens/brackets and quoted strings
  const parts = [];
  let depth = 0;
  let inQuote = false;
  let start = 0;
  for (let i = 0; i < block.length; i++) {
    const ch = block[i];
    if (ch === '"' && depth === 0) {
      inQuote = !inQuote;
    } else if (!inQuote) {
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      else if (ch === '}' || ch === ')' || ch === ']') depth--;
      else if (ch === ',' && depth === 0) {
        parts.push(block.slice(start, i));
        start = i + 1;
      }
    }
  }
  parts.push(block.slice(start));
  return parts;
}

function isSimpleStringValue(val) {
  // A string-like value: words, dots, hyphens, slashes, spaces — no parens, no braces, no arrows
  // Must NOT look like a JS identifier/expression (camelCase single word = likely a variable)
  if (/[{}()=>!&|?+\[\]]/.test(val)) return false;
  // Multi-word values are always strings (e.g. "Enter email", "Search products...")
  if (val.includes(' ')) return true;
  // Hash-prefixed values (#hex colors, #ids) — e.g. "#fff", "#6366f1"
  if (val.startsWith('#')) return true;
  // Values with dots, slashes, hyphens → likely paths/URLs (e.g. "logo.png", "/api/data")
  if (/[.\-\/]/.test(val)) return true;
  // Numeric values or values starting with a digit (e.g. "12", "0.8", "16px")
  if (/^[0-9]/.test(val)) return true;
  // Known CSS/SVG keyword values that use camelCase
  if (/^(currentColor|evenOdd|nonZero|sRGB|linearRGB)$/.test(val)) return true;
  // Single word without camelCase → string (e.g. "email", "Logo", "submit")
  // camelCase = has lowercase then uppercase transition (e.g. "logoUrl", "handleClick")
  if (/^[a-zA-Z0-9_]+$/.test(val) && !/[a-z][A-Z]/.test(val)) return true;
  // Everything else (camelCase, complex expressions) → expression
  return false;
}

// ---------------------------------------------------------------------------
// JSX emission
// ---------------------------------------------------------------------------

function emitJSX(node, level, output) {
  const ind = '  '.repeat(level);

  switch (node.type) {
    case 'fragment':
      emitFragment(node, level, output);
      break;
    case 'element':
      emitElement(node, level, output);
      break;
    case 'text':
      output.push(`${ind}${node.value}`);
      break;
    case 'expression':
      output.push(`${ind}{${node.value}}`);
      break;
    case 'conditional':
      emitConditional(node, level, output);
      break;
    case 'ternary':
      emitTernaryJSX(node, level, output);
      break;
    case 'map':
      emitMapJSX(node, level, output);
      break;
  }
}

function emitFragment(node, level, output) {
  const ind = '  '.repeat(level);
  output.push(`${ind}<>`);
  for (const child of node.children) {
    emitJSX(child, level + 1, output);
  }
  output.push(`${ind}</>`);
}

function emitElement(node, level, output) {
  const ind = '  '.repeat(level);
  const { tag, id, classes, props, inlineChild, children } = node;

  // Build opening tag
  let openParts = [tag];

  // id prop
  if (id) {
    if (id.type === 'string') {
      openParts.push(` id="${id.value}"`);
    } else {
      openParts.push(` id={${id.value}}`);
    }
  }

  // className prop
  if (classes.length > 0) {
    const hasExpr = classes.some(c => c.type === 'expression');
    if (hasExpr && classes.length === 1) {
      openParts.push(` className={${classes[0].value}}`);
    } else if (hasExpr) {
      // Mix of static and dynamic — use expression
      const parts = classes.map(c => c.type === 'string' ? `"${c.value}"` : c.value);
      openParts.push(` className={${parts.join(' + " " + ')}}`);
    } else {
      openParts.push(` className="${classes.map(c => c.value).join(' ')}"`);
    }
  }

  // Other props
  for (const prop of props) {
    if (prop.type === 'spread') {
      openParts.push(` {...${prop.value}}`);
    } else if (prop.type === 'boolean') {
      openParts.push(` ${prop.name}`);
    } else if (prop.type === 'string') {
      openParts.push(` ${prop.name}="${prop.value}"`);
    } else {
      openParts.push(` ${prop.name}={${prop.value}}`);
    }
  }

  const openTag = openParts.join('');

  // Self-closing: no children and no inline child
  if (children.length === 0 && !inlineChild) {
    output.push(`${ind}<${openTag} />`);
    return;
  }

  // Inline child only
  if (children.length === 0 && inlineChild) {
    if (inlineChild.type === 'text') {
      output.push(`${ind}<${openTag}>${inlineChild.value}</${tag}>`);
    } else {
      output.push(`${ind}<${openTag}>{${inlineChild.value}}</${tag}>`);
    }
    return;
  }

  // Block children
  output.push(`${ind}<${openTag}>`);
  if (inlineChild) {
    if (inlineChild.type === 'text') {
      output.push(`${'  '.repeat(level + 1)}${inlineChild.value}`);
    } else {
      output.push(`${'  '.repeat(level + 1)}{${inlineChild.value}}`);
    }
  }
  for (const child of children) {
    emitJSX(child, level + 1, output);
  }
  output.push(`${ind}</${tag}>`);
}

function emitConditional(node, level, output) {
  const ind = '  '.repeat(level);
  const childLines = [];
  emitJSX(node.child, 0, childLines);
  // Wrap: {condition && (
  //   <Child />
  // )}
  if (childLines.length === 1) {
    output.push(`${ind}{${node.condition} && (${childLines[0].trim()})}`);
  } else {
    output.push(`${ind}{${node.condition} && (`);
    for (const cl of childLines) {
      output.push(`${ind}  ${cl.trimStart()}`);
    }
    output.push(`${ind})}`);
  }
}

function emitTernaryJSX(node, level, output) {
  const ind = '  '.repeat(level);
  const consLines = [];
  emitJSX(node.consequent, 0, consLines);
  const altLines = [];
  emitJSX(node.alternate, 0, altLines);

  if (consLines.length === 1 && altLines.length === 1) {
    output.push(`${ind}{${node.condition} ? (${consLines[0].trim()}) : (${altLines[0].trim()})}`);
  } else {
    output.push(`${ind}{${node.condition} ? (`);
    for (const cl of consLines) {
      output.push(`${ind}  ${cl.trimStart()}`);
    }
    output.push(`${ind}) : (`);
    for (const al of altLines) {
      output.push(`${ind}  ${al.trimStart()}`);
    }
    output.push(`${ind})}`);
  }
}

function emitMapJSX(node, level, output) {
  const ind = '  '.repeat(level);
  const childLines = [];
  emitJSX(node.child, 0, childLines);

  if (childLines.length === 1) {
    output.push(`${ind}{${node.collection}.map(${node.param} => (${childLines[0].trim()}))}`);
  } else {
    output.push(`${ind}{${node.collection}.map(${node.param} => (`);
    for (const cl of childLines) {
      output.push(`${ind}  ${cl.trimStart()}`);
    }
    output.push(`${ind}))}`);
  }
}

// ---------------------------------------------------------------------------
// HTML emission
// ---------------------------------------------------------------------------

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const SVG_SELF_CLOSING = new Set([
  'circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'rect',
  'stop', 'use', 'image', 'animate', 'animateMotion', 'animateTransform', 'set',
]);

function emitHTMLNode(node, level, output) {
  const ind = '  '.repeat(level);

  switch (node.type) {
    case 'fragment':
      // HTML has no fragments — just emit children
      for (const child of node.children) {
        emitHTMLNode(child, level, output);
      }
      break;
    case 'element':
      emitHTMLElement(node, level, output);
      break;
    case 'text':
      output.push(`${ind}${node.value}`);
      break;
    case 'expression':
      // JSX-only construct — emit as-is with comment
      output.push(`${ind}<!-- JSXN expression: ${node.value} -->`);
      break;
    case 'conditional':
      output.push(`${ind}<!-- JSXN conditional: ${node.condition} -->`);
      emitHTMLNode(node.child, level, output);
      break;
    case 'ternary':
      output.push(`${ind}<!-- JSXN ternary: ${node.condition} -->`);
      emitHTMLNode(node.consequent, level, output);
      break;
    case 'map':
      output.push(`${ind}<!-- JSXN map: ${node.collection} -->`);
      emitHTMLNode(node.child, level, output);
      break;
  }
}

function emitHTMLElement(node, level, output) {
  const ind = '  '.repeat(level);
  const { tag, id, classes, props, inlineChild, children } = node;
  const isVoid = VOID_ELEMENTS.has(tag);

  // Build opening tag
  let openParts = [tag];

  // id attr
  if (id) {
    openParts.push(` id="${id.type === 'string' ? id.value : id.value}"`);
  }

  // class attr (not className)
  if (classes.length > 0) {
    const hasExpr = classes.some(c => c.type === 'expression');
    if (hasExpr) {
      // Dynamic classes can't be represented cleanly in HTML — use first expression
      openParts.push(` class="${classes.map(c => c.value).join(' ')}"`);
    } else {
      openParts.push(` class="${classes.map(c => c.value).join(' ')}"`);
    }
  }

  // Other props — all as string attributes or boolean
  for (const prop of props) {
    if (prop.type === 'spread') {
      // Spreads don't exist in HTML — skip with comment
      continue;
    } else if (prop.type === 'boolean') {
      openParts.push(` ${prop.name}`);
    } else {
      // All values as strings in HTML
      openParts.push(` ${prop.name}="${prop.value}"`);
    }
  }

  const openTag = openParts.join('');

  // Void elements: <br>, <img>, etc.
  if (isVoid) {
    output.push(`${ind}<${openTag}>`);
    return;
  }

  // No children and no inline child
  if (children.length === 0 && !inlineChild) {
    if (SVG_SELF_CLOSING.has(tag)) {
      output.push(`${ind}<${openTag} />`);
    } else {
      output.push(`${ind}<${openTag}></${tag}>`);
    }
    return;
  }

  // Inline child only
  if (children.length === 0 && inlineChild) {
    output.push(`${ind}<${openTag}>${inlineChild.value}</${tag}>`);
    return;
  }

  // Block children
  output.push(`${ind}<${openTag}>`);
  if (inlineChild) {
    output.push(`${'  '.repeat(level + 1)}${inlineChild.value}`);
  }
  for (const child of children) {
    emitHTMLNode(child, level + 1, output);
  }
  output.push(`${ind}</${tag}>`);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function findBalancedBrace(str, openPos) {
  let depth = 0;
  for (let i = openPos; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return str.length - 1;
}

function findUnbraced(str, char) {
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '{' || str[i] === '(' || str[i] === '[') depth++;
    else if (str[i] === '}' || str[i] === ')' || str[i] === ']') depth--;
    else if (str[i] === char && depth === 0) return i;
  }
  return -1;
}

function singularize(collection) {
  // Handle dotted paths: obj.items → item
  const name = collection.includes('.') ? collection.split('.').pop() : collection;

  if (name.endsWith('ies')) return name.slice(0, -3) + 'y';
  if (name.endsWith('ses') || name.endsWith('xes') || name.endsWith('zes')) return name.slice(0, -2);
  if (name.endsWith('ren') && name.length > 4) return name.slice(0, -3); // children→child
  if (name.endsWith('s') && !name.endsWith('ss')) return name.slice(0, -1);
  return 'item';
}
