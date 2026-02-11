import { decode } from './decoder.js';

/**
 * Decode a full JSXN file back into JSX/TSX source code.
 * Handles imports, types, hooks, function blocks, and JSX body.
 *
 * @param {string} jsxn - Full JSXN file notation
 * @returns {string} Decoded JSX/TSX source
 */
export function decodeFile(jsxn) {
  if (!jsxn || !jsxn.trim()) return '';

  const lines = jsxn.split('\n');
  const output = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line → preserve
    if (trimmed === '') {
      output.push('');
      i++;
      continue;
    }

    // Directive: "use client", "use server"
    if (trimmed.startsWith('"use ')) {
      output.push(trimmed);
      i++;
      continue;
    }

    // Import: @I module: specifiers
    if (trimmed.startsWith('@I ')) {
      output.push(decodeImport(trimmed));
      i++;
      continue;
    }

    // Type import: @T module: specifiers
    if (trimmed.startsWith('@T ')) {
      output.push(decodeTypeImport(trimmed));
      i++;
      continue;
    }

    // Interface: Name { ... } or Name extends X { ... } (top-level, starts with uppercase)
    if (/^[A-Z]/.test(trimmed) && !trimmed.includes('(') && trimmed.includes('{')) {
      const { text, nextIdx } = decodeInterfaceOrType(lines, i);
      output.push(text);
      i = nextIdx;
      continue;
    }

    // Type alias: Name = ... (top-level, starts with uppercase, has =)
    if (/^(export\s+)?[A-Z]/.test(trimmed) && trimmed.includes('=') && !trimmed.includes('(')) {
      output.push(decodeTypeAlias(trimmed));
      i++;
      continue;
    }

    // Function block: [export [default]] Name(params)
    if (isFunctionSignature(trimmed)) {
      const { text, nextIdx } = decodeFunctionBlock(lines, i);
      output.push(text);
      i = nextIdx;
      continue;
    }

    // Fallback: pass through
    output.push(line);
    i++;
  }

  return output.join('\n');
}

// ---------------------------------------------------------------------------
// Import decoding
// ---------------------------------------------------------------------------

function decodeImport(line) {
  const content = line.slice(3); // strip "@I "

  // Side-effect import: @I "styles.css"
  if (content.startsWith('"')) {
    return `import ${content}`;
  }

  const colonIdx = content.indexOf(':');
  if (colonIdx === -1) return `import ${content}`;

  const module = content.slice(0, colonIdx).trim();
  const specStr = content.slice(colonIdx + 1).trim();
  const specs = specStr.split(',').map(s => s.trim()).filter(Boolean);

  const parts = [];
  let defaultName = null;
  let namespace = null;

  for (const spec of specs) {
    if (spec.startsWith('default ')) {
      defaultName = spec.slice(8);
    } else if (spec.startsWith('* as ')) {
      namespace = spec;
    } else if (spec.includes(' as ')) {
      parts.push(spec);
    } else {
      parts.push(spec);
    }
  }

  if (namespace) {
    if (defaultName) {
      return `import ${defaultName}, ${namespace} from "${module}"`;
    }
    return `import ${namespace} from "${module}"`;
  }

  if (defaultName && parts.length > 0) {
    return `import ${defaultName}, { ${parts.join(', ')} } from "${module}"`;
  }

  if (defaultName) {
    return `import ${defaultName} from "${module}"`;
  }

  if (parts.length > 0) {
    return `import { ${parts.join(', ')} } from "${module}"`;
  }

  return `import "${module}"`;
}

function decodeTypeImport(line) {
  const content = line.slice(3); // strip "@T "

  if (content.startsWith('"')) {
    return `import type ${content}`;
  }

  const colonIdx = content.indexOf(':');
  if (colonIdx === -1) return `import type ${content}`;

  const module = content.slice(0, colonIdx).trim();
  const specStr = content.slice(colonIdx + 1).trim();
  const specs = specStr.split(',').map(s => s.trim()).filter(Boolean);

  let defaultName = null;
  const parts = [];

  for (const spec of specs) {
    if (spec.startsWith('default ')) {
      defaultName = spec.slice(8);
    } else {
      parts.push(spec);
    }
  }

  if (defaultName && parts.length > 0) {
    return `import type ${defaultName}, { ${parts.join(', ')} } from "${module}"`;
  }

  if (defaultName) {
    return `import type ${defaultName} from "${module}"`;
  }

  return `import type { ${parts.join(', ')} } from "${module}"`;
}

// ---------------------------------------------------------------------------
// Interface / type alias decoding
// ---------------------------------------------------------------------------

function decodeInterfaceOrType(lines, startIdx) {
  const firstLine = lines[startIdx].trim();
  let prefix = '';

  let rest = firstLine;
  if (rest.startsWith('export ')) {
    prefix = 'export ';
    rest = rest.slice(7);
  }

  // Check for extends
  const extendsMatch = rest.match(/^(\w+)\s+extends\s+(.+?)\s*(\{.*)$/);
  if (extendsMatch) {
    const name = extendsMatch[1];
    const extendsClause = extendsMatch[2];
    let body = extendsMatch[3];

    // Collect multi-line body
    const { fullBody, nextIdx } = collectBracedBlock(lines, startIdx, body);
    return {
      text: `${prefix}interface ${name} extends ${extendsClause} ${fullBody}`,
      nextIdx,
    };
  }

  // Simple interface: Name { ... }
  const nameMatch = rest.match(/^(\w+)\s*(\{.*)$/);
  if (nameMatch) {
    const name = nameMatch[1];
    let body = nameMatch[2];

    const { fullBody, nextIdx } = collectBracedBlock(lines, startIdx, body);
    return {
      text: `${prefix}interface ${name} ${fullBody}`,
      nextIdx,
    };
  }

  return { text: `${prefix}${rest}`, nextIdx: startIdx + 1 };
}

function collectBracedBlock(lines, startIdx, firstBodyPart) {
  let depth = 0;
  for (const ch of firstBodyPart) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }

  if (depth <= 0) {
    return { fullBody: firstBodyPart, nextIdx: startIdx + 1 };
  }

  const parts = [firstBodyPart];
  let idx = startIdx + 1;
  while (idx < lines.length && depth > 0) {
    const line = lines[idx];
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    parts.push(line);
    idx++;
  }

  return { fullBody: parts.join('\n'), nextIdx: idx };
}

function decodeTypeAlias(line) {
  let prefix = '';
  let rest = line.trim();

  if (rest.startsWith('export ')) {
    prefix = 'export ';
    rest = rest.slice(7);
  }

  return `${prefix}type ${rest}`;
}

// ---------------------------------------------------------------------------
// Function block decoding
// ---------------------------------------------------------------------------

function isFunctionSignature(line) {
  // Matches: [export [default]] Name(params) or Name()
  return /^(export\s+(default\s+)?)?[A-Za-z_$][A-Za-z0-9_$]*\(/.test(line);
}

function decodeFunctionBlock(lines, startIdx) {
  const sigLine = lines[startIdx].trim();

  // Parse signature: [export [default]] Name(params)
  const sigMatch = sigLine.match(/^((?:export\s+(?:default\s+)?)?)?([A-Za-z_$][A-Za-z0-9_$]*)\((.*)$/);
  if (!sigMatch) return { text: sigLine, nextIdx: startIdx + 1 };

  const prefix = (sigMatch[1] || '').trim();
  const name = sigMatch[2];
  const paramsRest = sigMatch[3];

  // Extract params (everything before the closing paren)
  const parenEnd = paramsRest.lastIndexOf(')');
  const params = parenEnd >= 0 ? paramsRest.slice(0, parenEnd) : paramsRest;

  // Collect indented body lines
  const bodyLines = [];
  let i = startIdx + 1;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '' && i + 1 < lines.length && lines[i + 1].match(/^\S/)) {
      // Empty line followed by non-indented line → end of block
      break;
    }
    // Check if this line is indented (part of function body) or is empty
    if (line.trim() === '') {
      bodyLines.push('');
      i++;
      continue;
    }
    if (/^\s/.test(line)) {
      bodyLines.push(line);
      i++;
    } else {
      break;
    }
  }

  // Process body lines
  const hookLines = [];
  const logicLines = [];
  let jsxnLines = null;

  let inJSX = false;
  for (const bLine of bodyLines) {
    const t = bLine.trim();

    if (t === '---') {
      inJSX = true;
      jsxnLines = [];
      continue;
    }

    if (inJSX) {
      // Remove 2 spaces of indentation (function body indent)
      jsxnLines.push(bLine.replace(/^  /, ''));
      continue;
    }

    if (t === '') {
      if (hookLines.length > 0 && logicLines.length === 0) {
        // blank line between hooks and logic
      }
      continue;
    }

    // Strip 2 spaces of function body indent
    const stripped = t;

    // @state name = val
    if (stripped.startsWith('@state ')) {
      hookLines.push(decodeUseState(stripped));
      continue;
    }

    // @ref name = val
    if (stripped.startsWith('@ref ')) {
      hookLines.push(decodeUseRef(stripped));
      continue;
    }

    // name = useHook(args) — other hooks
    if (/^[a-zA-Z_$]/.test(stripped) && stripped.includes('= use') && /= use[A-Z]/.test(stripped)) {
      hookLines.push(decodeHookCall(stripped));
      continue;
    }

    // Bare useEffect, useMemo, etc.
    if (/^use[A-Z]/.test(stripped)) {
      hookLines.push(`  ${stripped}`);
      continue;
    }

    // Logic line: add const if no keyword present
    logicLines.push(decodeLogicLine(stripped));
  }

  // Build output
  const funcPrefix = prefix ? `${prefix} ` : '';
  let sig = `${funcPrefix}function ${name}(${params}) {`;

  const outputParts = [sig];

  for (const hl of hookLines) {
    outputParts.push(hl);
  }

  if (hookLines.length > 0 && logicLines.length > 0) {
    outputParts.push('');
  }

  for (const ll of logicLines) {
    outputParts.push(ll);
  }

  if (jsxnLines !== null) {
    if (hookLines.length > 0 || logicLines.length > 0) {
      outputParts.push('');
    }
    const jsxBody = decode(jsxnLines.join('\n'));
    const indented = jsxBody.split('\n').map(l => l ? `    ${l}` : '').join('\n');
    outputParts.push('  return (');
    outputParts.push(indented);
    outputParts.push('  )');
  }

  outputParts.push('}');

  return { text: outputParts.join('\n'), nextIdx: i };
}

function decodeUseState(line) {
  // @state name = val → const [name, setName] = useState(val)
  const match = line.match(/^@state\s+(\w+)\s*=\s*(.+)$/);
  if (!match) return `  ${line}`;

  const name = match[1];
  const val = match[2];
  const setter = 'set' + name[0].toUpperCase() + name.slice(1);
  return `  const [${name}, ${setter}] = useState(${val})`;
}

function decodeUseRef(line) {
  // @ref name = val → const name = useRef(val)
  const match = line.match(/^@ref\s+(\w+)\s*=\s*(.+)$/);
  if (!match) return `  ${line}`;

  return `  const ${match[1]} = useRef(${match[2]})`;
}

function decodeHookCall(line) {
  // name = useHook(args) → const name = useHook(args)
  return `  const ${line}`;
}

function decodeLogicLine(line) {
  // If line starts with let/var, preserve as-is
  if (/^(let|var)\s+/.test(line)) {
    return `  ${line}`;
  }
  // Otherwise, add const
  return `  const ${line}`;
}
