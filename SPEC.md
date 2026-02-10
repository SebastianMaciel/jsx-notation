# JSXN — JSX Notation

Parser/encoder que compacta JSX en una notación minimalista optimizada para enviar a LLMs, reduciendo tokens ~40%.

## Origen


## Problema

JSX es extremadamente verboso para LLMs:
- Closing tags duplican info que ya da la indentación
- `className` se repite cientos de veces
- Props comunes (`onClick`, `onChange`, `disabled`) son largas
- Comillas y llaves agregan ruido

## Formato JSXN

### Headers (opcionales, generados por análisis de frecuencia)

```
@C Button=B, Input=I, Modal=M
@P onClick=k, onChange=g, disabled=x, placeholder=ph
@S items-center=ic, font-medium=fm
```

- `@C` — aliases de componentes (multi-char, por frecuencia)
- `@P` — aliases de props (>= 2 ocurrencias, largo > 4 chars)
- `@S` — aliases de clases CSS/Tailwind (>= 2 ocurrencias, largo > 3 chars)

### File-level headers (modo `encodeFile`)

```
@I react: default React, useState, useEffect
@I @/components/ui/button: Button
@T @/types: Product, Category
```

- `@I` — imports comprimidos (sin `import` / `from` / llaves)
- `@T` — type imports
- `@I "path.css"` — side-effect imports

### Reglas de sintaxis

| Concepto | JSX | JSXN |
|---|---|---|
| Elemento con clase | `<div className="foo">` | `div.foo` |
| Div implícito | `<div className="foo">` | `.foo` (se omite `div` si tiene selector) |
| Elemento con id | `<div id="bar">` | `div#bar` |
| Clase + id | `<div id="x" className="y">` | `div#x.y` |
| Texto literal | `<span>Hola</span>` | `span "Hola"` |
| Expresión JS | `<h2>{title}</h2>` | `h2 (title)` |
| Props | `onClick={handleX}` | `{k:handleX}` |
| String props | `type="email"` | `{type:email}` |
| Boolean props | `disabled` | `{disabled}` |
| Spread props | `{...props}` | `{...props}` |
| Self-closing | `<Input />` | `I` (sin hijos) |
| Condicional | `{cond && <X/>}` | `?cond > X` |
| Ternario | `{cond ? <A/> : <B/>}` | `?cond > A \| B` |
| Map/loop | `{items.map(i => <X/>)}` | `*items > X {key:i.id}` |
| Fragment | `<><A/><B/></>` | `_` (underscore como fragment) |
| Jerarquía | Tags abiertos/cerrados | Indentación (2 espacios) |
| Componente | `<Button>` | `B` (si hay alias) o `Button` |
| Member expr | `<Form.Input />` | `Form.Input` (no se aliasea) |

### Compresión de hooks y lógica (modo `encodeFile`)

| Concepto | Código | JSXN |
|---|---|---|
| useState | `const [x, setX] = useState(0)` | `@state x = 0` |
| useRef | `const ref = useRef(null)` | `@ref ref = null` |
| Otros hooks | `const data = useFetch(url)` | `data = useFetch(url)` |
| Variables | `const x = expr` | `x = expr` (se elimina `const/let/var`) |
| Separador JSX | `return (<JSX>)` | `---` seguido del JSXN |

### Ejemplo completo

**JSX original (~430 chars):**
```jsx
<Modal isOpen={showModal} onClose={handleClose}>
  <div className="modal-body">
    <h2>{title}</h2>
    {error && <Alert type="error">{error}</Alert>}
    <ul className="item-list">
      {items.map(item => (
        <li key={item.id} className="item" onClick={() => select(item)}>
          {item.name}
        </li>
      ))}
    </ul>
    <Button disabled={!selected} onClick={handleSubmit}>Confirmar</Button>
  </div>
</Modal>
```

**JSXN (~250 chars):**
```
@C Modal=M, Alert=A, Button=B
@P onClick=k, disabled=x, isOpen=io, onClose=oc

M {io:showModal, oc:handleClose}
  .modal-body
    h2 (title)
    ?error > A {type:error} (error)
    ul.item-list
      *items > li.item {key:item.id, k:()=>select(item)}
        (item.name)
    B {x:!selected, k:handleSubmit} "Confirmar"
```

## Arquitectura del encoder

### Dos modos de encoding

1. **`encode(code)`** — para snippets JSX sueltos. Solo genera JSXN del template.
2. **`encodeFile(code)`** — para archivos completos React/Next.js. Comprime imports, types, hooks, lógica y JSX.

### Pipeline (modo snippet)
1. **Parse** — `@babel/parser` con plugins `jsx` y `typescript` genera el AST
2. **Analyze** — recorrer el AST, contar frecuencia de componentes, props y clases CSS
3. **Generate aliases** — componentes/props/clases frecuentes reciben alias cortos
4. **Walk & emit** — recorrer el AST emitiendo JSXN con indentación

### Pipeline (modo file)
1. **Parse** — igual que snippet
2. **Directives** — preservar `"use client"`, `"use server"`
3. **Imports** — comprimir a `@I` / `@T`
4. **Types** — comprimir interfaces y type aliases
5. **Functions** — extraer signature, hooks, lógica y JSX; comprimir hooks
6. **JSX** — delegar al pipeline de snippet para el return JSX

### Módulos

```
jsxn/
  src/
    index.js          — entry point, exporta encode() y encodeFile()
    parser.js         — wrapper de @babel/parser
    analyzer.js       — frequency analysis de componentes, props y clases
    emitter.js        — AST walker que emite JSXN
    alias.js          — generación de aliases cortos (@C, @P, @S)
    file-encoder.js   — encoding de archivos completos (imports, hooks, lógica)
  mcp/
    index.js          — MCP server (stdio) con tools read_jsxn y encode_jsxn
  test/
    fixtures/         — archivos .jsx/.tsx de ejemplo
    encode.test.js    — tests del encoder (51 tests)
  package.json
  SPEC.md             — este archivo
  README.md           — documentación pública
  LICENSE             — MIT
```

### Dependencias

Producción:
```json
{
  "@babel/parser": "^7.26.0",
  "@babel/traverse": "^7.26.0",
  "@modelcontextprotocol/sdk": "^1.26.0",
  "zod": "^4.3.6"
}
```

Dev:
```json
{
  "vitest": "^1.6.0"
}
```

## Algoritmo de alias

### Componentes (`@C`)
1. Todos los componentes custom con nombre > 1 char se aliasean
2. Ordenar por frecuencia descendente
3. Asignar alias: primera letra mayúscula, si colisiona agregar letras (`Button=B`, `Badge=Bg`)

### Props (`@P`)
1. Filtrar props con >= 2 ocurrencias y largo > 4 chars
2. Ordenar por frecuencia descendente
3. Para `onX` props: buscar letras distintivas del evento (`onClick=k`, `onChange=g`)
4. Fallback: primera letra minúscula, agregar letras si colisiona

### Clases CSS (`@S`)
1. Filtrar clases con >= 2 ocurrencias y largo > 3 chars
2. Ordenar por potencial de ahorro (count * length)
3. Estrategias de alias en orden:
   - Iniciales de cada segmento separado por `-`/`:` (`items-center=ic`, `font-medium=fm`)
   - Iniciales + último char (`bg-gray-50=bg5`)
   - Primeros 2 chars + iniciales del resto
   - Abreviaciones progresivamente más largas
4. Solo usar alias si es más corto que el original

## MCP Server

MCP server con transporte stdio para integración con IDEs/AI assistants.

### Tools

| Tool | Input | Output |
|---|---|---|
| `read_jsxn` | `path` (string) | Lee archivo .jsx/.tsx/.js/.ts del disco, devuelve JSXN |
| `encode_jsxn` | `code` (string), `mode` ("file" \| "snippet") | Encodea código crudo a JSXN |

### Seguridad

- Solo acepta archivos `.jsx`, `.tsx`, `.js`, `.ts`
- Resuelve symlinks con `realpath()` y verifica extensión del target
- Límite de 10 MB por archivo/input
- Errores sanitizados (sin leak de paths absolutos o stack traces)
- Límite de profundidad de recursión (MAX_DEPTH=200) en el encoder

### Configuración

```bash
# Claude Code
claude mcp add jsxn -- npx jsxn-mcp

# Cursor (~/.cursor/mcp.json)
{ "mcpServers": { "jsxn": { "command": "npx", "args": ["jsxn-mcp"] } } }

# VS Code Copilot (.vscode/mcp.json)
{ "servers": { "jsxn": { "command": "npx", "args": ["jsxn-mcp"] } } }
```

## Detección de patrones especiales

### Condicionales
```
// Pattern: LogicalExpression(&&) con JSXElement como right
{condition && <Component />}
→ ?condition > Component
```

### Ternarios
```
// Pattern: ConditionalExpression con JSX en consequent/alternate
{condition ? <A /> : <B />}
→ ?condition > A | B
```

### Maps
```
// Pattern: CallExpression(.map) que retorna JSXElement
{items.map(item => <Component key={item.id} />)}
→ *items > Component {key:item.id}
```

### Fragments
```
// Pattern: JSXFragment
<><A /><B /></>
→ _
    A
    B
```

## Casos borde

- JSX con spread props: `<Comp {...props} />` → `Comp {...props}`
- Componentes con namespace: `<Form.Input />` → `Form.Input` (no se aliasean)
- Props computadas: `className={cn('a', { b: cond })}` → `.{cn('a',{b:cond})}`
- Div implícito: `<div className="x">` → `.x` (se omite el tag `div` si tiene selector)
- Children como función (render props): se mantienen como expresión cruda
- Archivos con múltiples exports/componentes: se procesa cada uno
- Código no-JSX (hooks, lógica): comprimido en modo `encodeFile`, pasado tal cual en modo `encode`
- TSX con generics: `<Comp<T> />` — el parser de babel lo maneja
- Archivos sin JSX: `encode()` devuelve el código original sin modificar
