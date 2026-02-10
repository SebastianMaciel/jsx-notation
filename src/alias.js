/**
 * Generate short aliases for frequently-used components and props.
 *
 * @param {{ components: Map<string, number>, props: Map<string, number> }} frequencies
 * @returns {{ components: Map<string, string>, props: Map<string, string> }}
 */
export function generateAliases(frequencies) {
  const compAliases = generateComponentAliases(frequencies.components);
  const propAliases = generatePropAliases(frequencies.props);
  const classAliases = generateClassAliases(frequencies.classes ?? new Map());
  return { components: compAliases, props: propAliases, classes: classAliases };
}

/**
 * Format alias headers (@C and @P lines).
 *
 * @param {{ components: Map<string, string>, props: Map<string, string> }} aliases
 * @returns {string} header lines (may be empty string)
 */
export function formatHeaders(aliases) {
  const lines = [];

  if (aliases.components.size > 0) {
    const entries = [...aliases.components.entries()]
      .map(([name, alias]) => `${name}=${alias}`)
      .join(', ');
    lines.push(`@C ${entries}`);
  }

  if (aliases.props.size > 0) {
    const entries = [...aliases.props.entries()]
      .map(([name, alias]) => `${name}=${alias}`)
      .join(', ');
    lines.push(`@P ${entries}`);
  }

  if (aliases.classes.size > 0) {
    const entries = [...aliases.classes.entries()]
      .map(([name, alias]) => `${name}=${alias}`)
      .join(', ');
    lines.push(`@S ${entries}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Component aliases
// ---------------------------------------------------------------------------

function generateComponentAliases(frequencies) {
  const aliases = new Map();
  // Alias all custom components whose name is longer than 1 char (alias saves tokens)
  const candidates = [...frequencies.entries()]
    .filter(([name]) => name.length > 1)
    .sort((a, b) => b[1] - a[1]);

  const usedAliases = new Set();

  for (const [name] of candidates) {
    const alias = findUniqueAlias(name, usedAliases, true);
    usedAliases.add(alias);
    aliases.set(name, alias);
  }

  return aliases;
}

// ---------------------------------------------------------------------------
// Prop aliases
// ---------------------------------------------------------------------------

function generatePropAliases(frequencies) {
  const aliases = new Map();
  // Filter: >= 2 occurrences, name length > 4
  const candidates = [...frequencies.entries()]
    .filter(([name, count]) => count >= 2 && name.length > 4)
    .sort((a, b) => b[1] - a[1]);

  const usedAliases = new Set();

  for (const [name] of candidates) {
    const alias = findPropAlias(name, usedAliases);
    usedAliases.add(alias);
    aliases.set(name, alias);
  }

  return aliases;
}

// ---------------------------------------------------------------------------
// Class aliases (Tailwind / utility classes)
// ---------------------------------------------------------------------------

function generateClassAliases(frequencies) {
  const aliases = new Map();
  // Alias classes that appear >= 2 times AND are longer than 3 chars
  // (no point aliasing "p-6" → "p6", but "items-center" → "ic" saves a lot)
  const candidates = [...frequencies.entries()]
    .filter(([name, count]) => count >= 2 && name.length > 3)
    .sort((a, b) => {
      // Sort by savings potential: (name.length - alias.length) * count
      // Approximate with count * name.length descending
      const savingsA = a[1] * a[0].length;
      const savingsB = b[1] * b[0].length;
      return savingsB - savingsA;
    });

  const usedAliases = new Set();

  for (const [name] of candidates) {
    const alias = findClassAlias(name, usedAliases);
    // Only use the alias if it's actually shorter
    if (alias.length < name.length) {
      usedAliases.add(alias);
      aliases.set(name, alias);
    }
  }

  return aliases;
}

/**
 * Generate a short alias for a CSS class name.
 * Strategy: take initials of each segment separated by - or :
 *   "items-center" → "ic"
 *   "bg-gray-50"   → "bg5" (initials + last digit)
 *   "hover:bg-blue-700" → "hbb7"
 *   "font-medium"  → "fm"
 *   "text-sm"      → "ts"
 */
function findClassAlias(name, usedAliases) {
  // Split on - and : to get segments
  const segments = name.split(/[-:]/);

  // Strategy 1: initials of each segment
  let alias = segments.map(s => s[0] ?? '').join('');
  if (alias && !usedAliases.has(alias) && alias.length < name.length) return alias;

  // Strategy 2: initials + last char of last segment (helps with numbered classes)
  const lastSeg = segments[segments.length - 1];
  if (lastSeg.length > 1) {
    alias = segments.map(s => s[0] ?? '').join('') + lastSeg[lastSeg.length - 1];
    if (!usedAliases.has(alias) && alias.length < name.length) return alias;
  }

  // Strategy 3: first 2 chars of first segment + initials of rest
  if (segments[0].length >= 2) {
    alias = segments[0].slice(0, 2) + segments.slice(1).map(s => s[0] ?? '').join('');
    if (!usedAliases.has(alias) && alias.length < name.length) return alias;
  }

  // Strategy 4: progressively longer abbreviations
  for (let len = 2; len < name.length; len++) {
    alias = name.replace(/[-:]/g, '').slice(0, len);
    if (!usedAliases.has(alias) && alias.length < name.length) return alias;
  }

  return name; // give up, return original
}

// ---------------------------------------------------------------------------
// Alias generation strategies
// ---------------------------------------------------------------------------

/**
 * Find a unique short alias for a component or prop name.
 */
function findUniqueAlias(name, usedAliases, isComponent) {
  // For onX props, try distinctive letters from the event name
  // onClick → k, onChange → g, onSubmit → s, onClose → c
  if (!isComponent && name.startsWith('on') && name.length > 2) {
    const eventPart = name.slice(2); // "Click", "Change", etc.
    // Try each letter from the end (more distinctive) backwards
    for (let i = eventPart.length - 1; i >= 0; i--) {
      const ch = eventPart[i].toLowerCase();
      if (!usedAliases.has(ch)) return ch;
    }
    // Try two-letter combos
    for (let i = 0; i < eventPart.length - 1; i++) {
      const twoChar = eventPart.slice(i, i + 2).toLowerCase();
      if (!usedAliases.has(twoChar)) return twoChar;
    }
  }

  // Start with first letter (uppercase for components, lowercase for props)
  const firstChar = isComponent ? name[0].toUpperCase() : name[0].toLowerCase();
  if (!usedAliases.has(firstChar)) return firstChar;

  // Add letters progressively
  let alias = firstChar;
  for (let i = 1; i < name.length; i++) {
    alias += isComponent ? name[i] : name[i].toLowerCase();
    if (!usedAliases.has(alias)) return alias;
  }

  return alias;
}

function findPropAlias(name, usedAliases) {
  return findUniqueAlias(name, usedAliases, false);
}
