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

### Headers (opcionales)

```
@C Button=B, Input=I, Modal=M
@P onClick=k, onChange=g, disabled=x, placeholder=ph
```

- `@C` — aliases de componentes (los más frecuentes en el archivo)
- `@P` — aliases de props (los más frecuentes)
- Se generan automáticamente por análisis de frecuencia

### Reglas de sintaxis

| Concepto | JSX | JSXN |
|---|---|---|
| Elemento con clase | `<div className="foo">` | `div.foo` |
| Elemento con id | `<div id="bar">` | `div#bar` |
| Clase + id | `<div id="x" className="y">` | `div#x.y` |
| Texto literal | `<span>Hola</span>` | `span "Hola"` |
| Expresión JS | `<h2>{title}</h2>` | `h2 (title)` |
| Props | `onClick={handleX}` | `{k:handleX}` |
| String props | `type="email"` | `{type:email}` |
| Self-closing | `<Input />` | `I` (sin hijos) |
| Condicional | `{cond && <X/>}` | `?cond > X` |
| Ternario | `{cond ? <A/> : <B/>}` | `?cond > A \| B` |
| Map/loop | `{items.map(i => <X/>)}` | `*items > X {key:i.id}` |
| Fragment | `<><A/><B/></>` | `_` (underscore como fragment) |
| Jerarquía | Tags abiertos/cerrados | Indentación (2 espacios) |
| Componente | `<Button>` | `B` (si hay alias) o `Button` |

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
  div.modal-body
    h2 (title)
    ?error > A {type:error} (error)
    ul.item-list
      *items > li.item {key:item.id, k:()=>select(item)}
        (item.name)
    B {x:!selected, k:handleSubmit} "Confirmar"
```

## Arquitectura del encoder

### Input
Archivo `.jsx` o `.tsx` (string de código fuente).

### Pipeline
1. **Parse** — `@babel/parser` con plugins `jsx` y `typescript` genera el AST
2. **Analyze** — recorrer el AST, contar frecuencia de componentes y props
3. **Generate headers** — los componentes/props con frecuencia >= 2 reciben alias cortos
4. **Walk & emit** — recorrer el AST emitiendo JSXN con indentación

### Output
String en formato JSXN.

### Módulos sugeridos

```
jsxn/
  src/
    index.js          — entry point, exporta encode(jsxCode) => jsxnString
    parser.js         — wrapper de @babel/parser
    analyzer.js       — frecuency analysis de componentes y props
    emitter.js        — AST walker que emite JSXN
    alias.js          — generación de aliases cortos (@C, @P)
  test/
    fixtures/         — archivos .jsx de ejemplo
    encode.test.js    — tests del encoder
  package.json
  SPEC.md             — este archivo
```

### Dependencias

```json
{
  "@babel/parser": "^7.x",
  "@babel/traverse": "^7.x"
}
```

Dev:
```json
{
  "vitest": "^1.x"
}
```

## Algoritmo de alias

1. Recorrer AST y contar `{ componentName: count, propName: count }`
2. Filtrar los que aparecen >= 2 veces
3. Ordenar por frecuencia descendente
4. Asignar alias:
   - Componentes: primera letra mayúscula, si colisiona agregar segunda letra (`Button=B`, `Badge=Bg`)
   - Props: primera letra minúscula, si colisiona agregar letras (`onClick=k`, `onChange=g`, `onSubmit=os`)
5. Props con nombre corto (<= 4 chars) no se aliasean (`key`, `type`, `ref`)

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



- En `readRepoFiles()`, cuando el archivo es `.jsx` o `.tsx`:
  1. Leer el contenido original
  2. Pasar por `jsxnEncode(content)`
  3. Enviar la versión compacta al modelo en lugar del código crudo

## Casos borde a manejar

- JSX con spread props: `<Comp {...props} />` → `Comp {...props}`
- Componentes con namespace: `<Form.Input />` → `Form.Input`
- Props computadas: `className={cn('a', { b: cond })}` → `.{cn('a',{b:cond})}`
- Children como función (render props): mantener como expresión cruda
- Archivos con múltiples exports/componentes: procesar cada JSXElement raíz
- Código no-JSX (hooks, lógica): no comprimir, pasar tal cual o omitir
- TSX con genérics: `<Comp<T> />` — el parser de babel lo maneja

## Fases de desarrollo

### Fase 1 — Encoder básico
- Parse JSX con babel
- Emitir indentación, clases, ids, texto, expresiones
- Sin aliases, sin patrones especiales
- Tests con fixtures simples

### Fase 2 — Aliases y frecuencia
- Análisis de frecuencia
- Generación de headers @C y @P
- Tests con componentes reales

### Fase 3 — Patrones especiales
- Detectar condicionales, ternarios, maps, fragments
- Tests con fixtures complejas

- Hook en `readRepoFiles()`
- Instrucción JSXN en system prompt
- Test end-to-end: enviar mensaje sobre componente JSX, verificar que el modelo entiende
