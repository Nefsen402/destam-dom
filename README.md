# destam-dom

This is a dom manipulation library built on [destam](https://github.com/equator-studios/destam) (delta state manager). This library's purpose is to provide bindings to interpret destam deltas as mutations on the dom.

See the [documentation](doc.md)

## Basic counter
```js
const count = Observer.mutable(0);
mount(document.body, html`
	<button $onclick=${() => count.set(count.get() + 1)}>
		Button clicked ${count} times
	</button>
	<button $onclick=${() => count.set(0)}>Reset</button>
`);
```

## No virtual dom
Virtual doms were a mistake:
- they allocate a lot of memory just to represent the dom
- they make it impossible to make static analysis tools to unroll dom descriptions into vanillajs
- they require a lot of magic called "reconciliation" in order to actually work
- they have horrible performance with lists as virtual dom implementations are forced to iterate the entire tree

destam-dom relies on the idea of signals, but destam-dom does not attempt to re-invent another state library, it's built on the existing destam library. Destam provides primitives that generate deltas whenever they are mutated, and destam-dom takes those deltas and interprets them as dom manipluations. This approach achieves true constant time insertion, deletion and modification to dom children.

## List example
```js
const numbers = OArray([1, 2, 3]);

const NumComponent = ({each: num}) => {
	return html`${num} `;
};

mount(document.body, html`
	<button $onclick=${() => numbers.push(numbers.length + 1)}>
		Add number
	</button>
	<p>
		<${NumComponent} each=${numbers}/>
	</p>
`);
```

## JSX compatible
destam-dom provides various source passes under transform/ for build systems that will take ```html`` ``` template literals and JSX and turn it into simple calls that destam-dom directly understands so that no parsing has to happen at runtime.

## More examples
The `examples` directory provides many simple examples for how to use this library.
```bash
npm run dev
```
And navigate to one of the compliment `.html` files for each implementation. For instance, if you wanted to see the result of `examples/basic.js`, navigate to `examples/basic.html` in the browser.
