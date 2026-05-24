# destam-dom — Agent Reference

Dense, factual reference for destam-dom, written for coding agents reading this package directly. Pairs with the underlying `destam` package's `AGENTS.md` (at `node_modules/destam/AGENTS.md`) which covers Observers, observables (OObject/OArray/OMap), deltas, networks, governors, and transforms. **Read that first.** This file does not repeat any of it — it only documents how destam-dom binds destam to the DOM.

The user-facing prose docs are in `docs/doc.md` (general) and `docs/react-migration.md` (mapping React patterns to destam-dom).

---

## What this library is

A DOM binding for destam. It takes destam deltas and applies them as DOM mutations. No virtual DOM, no reconciliation pass — destam already produces the per-mutation delta, so DOM updates are point-edits. List reconciliation is by reference identity (`Map` lookup), not by index, so constant-time insertion/deletion is the design goal.

Two user-facing primitives: `mount` and `html` (plus `h` if you want to skip the template parser).

```js
import {mount, html, Observer, OObject, OArray} from 'destam-dom';
```

`Observer` / `OObject` re-exported from `destam` for convenience; `OArray` exported here is **not** the same as `destam`'s — see "Local OArray" below.

---

## Files

| File | Purpose |
|---|---|
| `index.js` | Re-exports public API. |
| `dom.js` | Core: `mount`, `h`, `getFirst`. All DOM mounting logic, the deferred-call queue, custom-component lifecycle, array reconciliation. |
| `htm.js` | Tagged-literal parser. Default export is `htm(h)` → the `html` template literal. Parses tags/attrs/children into `h(...)` calls at runtime. |
| `Array.js` | The lightweight `OArray` exported by destam-dom (no UUIDs — see below). |
| `util.js` | Alternate entry exposing `mount`, `createElement`, `createTextNode`, `watch`, `setAttribute`. Used by the `staticMount` transform's generated code. |
| `transform/` | Build-time AST passes (see "Transforms"). |
| `examples/` | Browseable examples — served by `npm run dev` at `/<name>`. |
| `tests/` | `node --test` tests. `tests/document.js` is a tiny DOM mock so tests run under Node without jsdom. |
| `docs/doc.md`, `docs/react-migration.md` | User docs. |

---

## `mount(elem, item, before?, context?)`

The entry point. Returns a remove function. The remove function also responds to the internal `getFirst` symbol (returns the first child DOM node) — only relevant if you're writing custom hyperscript.

Accepted `item` types — anything `mount` can render:

- string / number / boolean (rendered as text — booleans render as `"true"`/`"false"`)
- `null` (renders nothing; `undefined` **asserts** — see Footguns)
- DOM `Node`
- iterable of any of the above (arrays, generators, etc.)
- a function returning a DOM element (an `h` template — what `html`/`h`/JSX produce)
- an `Observer` resolving to any of the above

`before` is internal: a callback the parent uses to locate the insertion point. Almost never passed by user code.

`context` is the 4th argument and is **propagated implicitly** through every nested `mount` call. It's the destam-dom equivalent of a React context — opaque, user-defined, read by custom hyperscript or by components that opt in. See `examples/context.jsx` for the canonical `createContext()` pattern built on top of this.

### Mount-target duck typing

`elem` does not have to be a real DOM node. Anything implementing `insertBefore`, `replaceChild`, `removeChild` works. For fast array clears, also implement `get firstChild` and `set textContent` (destam-dom checks `firstChild` and uses `textContent = ''` as a fast path). Useful for component-internal "virtual roots" that intercept children, and for testing (`tests/document.js`).

### Observer modes

If `item` is an Observer, `mount` subscribes with `shallowListener` and re-renders on every change. Internally it tracks the *kind* of the resolved value (node / primitive / array / function) and short-circuits when the kind doesn't change — e.g. an observer flipping between two strings reuses the same text node and only updates `textContent`.

---

## `html` / `h`

`html` is `htm(h)`. It parses tagged template literals into `h(name, props, ...children)` calls. At runtime, the parser re-runs on every invocation — fine for tops of components (called once), measurable inside hot loops. The `transform/htmlLiteral` build pass eliminates this by unrolling ``html`...` `` tags into direct `h(...)` calls at build time (same transform that handles JSX). Use it via vite/babel for production, or hoist the literal out of the loop if you can't.

### Property setter prefix: `$`

The `$` prefix means **property** (DOM IDL), no prefix means **attribute**. The two are not interchangeable:

- `<input $value=${x}>` → `input.value = x` — what you almost always want for form state.
- `<input value=${x}>` → `input.setAttribute('value', x)` — initial value only; doesn't track user edits.

Same for events: `$onclick=${fn}` sets `elem.onclick = fn`. There is no `addEventListener` route in core; if you want one, write a custom `h` (see `examples/custom-h.jsx`).

`$style=${{...}}` accepts a plain object whose values may be observers. Each property is set via `elem.style[key] = value`.

### Element name forms

- string: tag name, validated against `validTags` in `htm.js` (or contains `-` for custom elements).
- function: custom component. Called once when mounted, never re-invoked.
- DOM `Node`: mounted as-is. This is how refs work — there's no virtual DOM, so the real node *is* the ref. `mount` asserts the node has no parent (cannot mount a node that's already mounted elsewhere).

In JSX, name capitalization disambiguates: lowercase → string tag name; capitalized → variable reference (component or node). In `html`, interpolation always means reference: `<${MyComp} />` or `<${someNode} />`.

### Props

- `<elem name=${val}>` — single attribute/property.
- `<elem =${obj}>` — spread (object's keys become props). Compatible with JSX `{...obj}`.
- `children=${[...]}` — explicit children prop. Must be `null` or a plain JS `Array` (not an OArray, not an iterable). Setting `children` while also providing a body asserts.

### Component children

Custom components receive `props.children` as an array (always, even if there's one child). Pass it through to render:

```js
const Header = ({children}) => html`<h1>${children}</h1>`;
```

### The `each` prop

Special-cased on custom components — turns the component into a per-element renderer over a list (array or `Observer<array>`). The component's `each` prop becomes the *element*, not the list:

```js
const Item = ({each: x}) => html`<li>${x}</li>`;
html`<${Item} each=${arr} />`;
```

When `each` is an Observer of an array, the renderer re-runs only for changed elements — reconciliation is **by reference identity** (`Map.get(item)`). Identical primitives/objects reuse their DOM; new ones get rendered. If you want stable identity across `set()` calls of replaced arrays, use stable references (the same string, the same object). For constant-time insert/delete, use `OArray` — destam-dom hooks the delta stream directly.

`children` and `each` are the only specially-cased prop names; everything else is free.

---

## Custom components

Function signature: `(props, cleanup, mounted) => renderableOrFunction`.

- `cleanup(...fns)` — register teardown callbacks. Called after the component and all descendants are unmounted. Safe to call after unmount (immediate invocation). Safe to call from within `mounted`. Multiple fns / zero fns both fine.
- `mounted(...fns)` — register post-mount callbacks. Fired after every descendant is mounted and the component is visible from the mount root. **Only valid during construction** — calling it after mount-time is invalid.

The component runs *once*. There is no re-render. Reactivity is achieved by returning Observers (or templates containing them) and letting destam-dom subscribe.

The return value can be anything `mount` accepts, *or* a `(elem, val, before, context) => removeFn` function — the "low-level" mounter form, used by `examples/context.jsx` to intercept the `context` argument.

### Deferred call queue

User-space callbacks (component constructors, `cleanup`, `mounted`) are deferred — they run after the current mount/unmount walk finishes. Inside one synchronous user-facing call (`mount(...)`, an array mutation that triggers re-render, etc.), the queue is drained at the end. This prevents user code mutating state mid-traversal and corrupting in-flight algorithms.

Practical consequence: don't assume strict ordering between sibling components' `mounted` callbacks vs. observer effects firing — the docs explicitly note this. If you need ordering, chain through one observer.

---

## Lifetime semantics vs React

destam-dom calls `mounted` synchronously the moment the component is visible from the mount root. React batches into the idle cycle. If you're porting React code that relied on async layout-effect timing, you may see different ordering in destam-dom. See `docs/react-migration.md` for the full cheat-sheet (it's short).

Key mapping for porters:

| React | destam-dom |
|---|---|
| `useState(x)` | `Observer.mutable(x)` |
| `useEffect(cb, deps)` | `cleanup(Observer.all(deps).effect(cb))` |
| `useEffect(cb, [])` | constructor body / `cleanup(destroy)` |
| `useLayoutEffect(cb)` | `mounted(cb)` |
| `useMemo(v)` | `const v = ...` (no memoization needed — runs once) |
| `useRef()` | `const Ref = <div />;` and use `Ref` directly |

---

## Local `OArray` (Array.js) vs `destam`'s OArray

This package exports an `OArray` from `./Array.js` that is *not* the same as `destam/Array.js`. The local one is **simplified for DOM use**: same proxy interface, same delta emission, same `splice`/`push`/`shift` shape — but **no UUID-keyed identity**. That makes it cheaper for the common case (rendering a list) but means `destam`'s `Network` / `Tracking` / `createNetwork` won't work on it (no IDs to address).

If you need replication, undo/redo, or serialization, import from `destam` directly:

```js
import OObject from 'destam/Object';
import OArray from 'destam/Array';  // the UUID-tracking one
import createNetwork from 'destam/Tracking';
```

This is exactly what `examples/todo.jsx` does. The comment in that file explains why.

The local `OArray` also overrides `sort` and `reverse` to `undefined` (would break delta semantics) — same as the upstream.

---

## Footguns

- **`undefined` asserts.** Mounting `undefined` (directly or as a resolved Observer value) is treated as a bug. Use `null` for "show nothing." This catches typos and dangling property access. Wrap with `.map(v => v ?? null)` if you have a legit undefined source.
- **Nested observers are unsupported.** An Observer whose value is itself an Observer asserts in `mount`. Use `.unwrap()` upstream.
- **`children` must be a plain Array, not OArray.** Passing an OArray to `children=` will not be reactive (asserts during dev). If you want a reactive child list, use the `each` pattern or interpolate an `OArray` as a single child: `<div>${arr}</div>`.
- **Don't include element body and `children` prop together.** Even an empty body counts. Pick one.
- **Element body whitespace.** `html` collapses whitespace between tags into single spaces and strips empty text. JSX in destam-dom does the same. If you need exact whitespace, build text nodes manually.
- **Mounting an already-mounted node asserts.** A raw DOM `Node` can only be mounted in one place at a time. Unmount first or use a fresh node.
- **JSX naming.** In JSX, lowercase tag names are strings (HTML tags); capitalized names are variable references. `<myCustom />` is a string tag and will try to be an HTML element — name your components / refs with a capital letter.
- **`html` parses every call at runtime — unless built.** The runtime template parser re-runs per invocation. The `transform/htmlLiteral` build pass unrolls both JSX *and* `html` literals into direct `h(...)` calls, eliminating the parse cost; the vite config in this repo enables it. Without that pass, hoist the literal out of hot loops.

---

## Transforms (`transform/`)

Build-time AST passes for Babel. Useful with vite/rollup/webpack. The `vite.config.js` in this repo wires them up for the dev server and `npm run build`.

Every transform is the default export of a small wrapper produced by `createTransform` (`transform/util.js`). That wrapper accepts either a **source string** (parsed internally) or an **AST**, runs the Babel pass, and returns `{code, map, ast}` — so transforms compose by passing `output.ast` straight into the next one without round-tripping through source.

| Transform | What it does | When you'd want it |
|---|---|---|
| `htmlLiteral.js` | Compiles JSX **and** ``html`...` `` tagged literals to `h(...)` calls at build time. | Default for JSX. Also strips the runtime cost of `html` parsing if you care. |
| `assertRemove.js` | Strips all `assert(...)` calls. | Production builds. Many internal sanity checks are wrapped in `assert` — fine in dev, dead weight in prod. |
| `staticMount.js` | Detects fully-static portions of templates and unrolls them into direct `createElement` / `appendChild` calls. Avoids the `h`/`mount` machinery for those subtrees. | Optimization pass for static-heavy templates. Only generated when `STATIC_ANALYZE=1`. |
| `unsafeVariables.js` | Aggressive minification helper. Used only for the bundled CDN dist (`npm run release`). | Don't enable unless you know what you're doing. |

The minifier (terser) also mangles all trailing-underscore properties (`/_$/`) in release builds. Same convention as destam: trailing `_` ≡ "mangleable / internal-but-public-surface."

### Running

- `npm run dev` — vite dev server with JSX transform + example browser.
- `npm run build` — example bundle build.
- `npm run release` — produces the published CDN dist (`LIB=destamd N_DEBUG=1`).
- `npm test` — `node --test`. The tests use `tests/document.js` (a tiny in-process DOM mock), no jsdom.

---

## Internal symbols / conventions you may encounter

- `getFirst` (Symbol exported from `dom.js`) — passed to a mounter to ask "what's your first DOM node?" Used by `before` callbacks and by `mount`'s remove function. Encountered when writing custom hyperscript or duck-typed mount targets.
- `cleared` (exported, mutable) — set during array fast-clear (`elem.textContent = ''`). Internal flag so descendants don't try to `removeChild` from an already-cleared parent.
- `elem_` / `[getFirst]` on `h()` return values — internal shape of an "h template." `{[getFirst]: signals, elem_: node}` for nodes with reactive bindings, plain `node` for fully static. Don't construct these by hand; use `h`/`html`/JSX.

---

## When in doubt

- For DOM behavior questions: read `dom.js` directly — it's ~650 lines.
- For template parsing edge cases: `htm.js` and `tests/baseline.htm.test.js`.
- For lifecycle ordering: the deferred-queue logic in `dom.js` (`callDeferred`, `appendDeferred`) and `tests/baseline.customElement.test.js`.
- For destam (observers, deltas, governors, OObject/OArray with UUIDs, networks): `node_modules/destam/AGENTS.md` and `node_modules/destam/docs/`.
