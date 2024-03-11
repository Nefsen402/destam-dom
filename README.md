# destam-dom

This is a dom manipulation library built on destam. This library does not use a virtual dom and its purpose is to provide a binding from mutation events that happen through the destam state manager to then manipulate the dom. This library is designed to be as simple as possible. It does not provide any filtering of events to account for browser differences or any magic regarding node attributes. This is designed to be a base for other libraries to build on top of to provide those creature comforts.

## Basic counter
```js
const count = Observer.mutable(0);
mount(document.body, html`
	<button click=${() => count.set(count.get() + 1)}>
		Button clicked ${count} times
	</button>
	<button click=${() => count.set(0)}>Reset</button>
`);
```

## No virtual dom
Virtual doms were a mistake:
- they make a lot of garbage for the garbage collector to collect
- they require a lot of magic called "reconciliation" in order to actually work
- they have horrible performance with lists

destam-dom relies on the idea of signals, but destam-dom does not attempt to re-invent another state library, it's built on the existing [destam library](https://github.com/equator-studios/destam). Destam provides primitives that generate deltas whenever they are mutated, and destam-dom takes those deltas and interprets them as dom manipluations. This approach achieves true constant time insertion, deletion and modification to dom children.

## List example
```js
const numbers = OArray([1, 2, 3]);

const NumComponent = ({each: num}) => {
	return html`${num} `;
};

mount(document.body, html`
	<button click=${() => numbers.push(numbers.length + 1)}>
		Add number
	</button>
	<p>
		<${NumComponent} each=${numbers}/>
	</p>
`);
```

## JSX compatible
destam-dom provides source passes under transform/ that will take the ```html`` ``` syntax and jsx and turn it into simple calls that destam-dom directly understands so that no parsing has to happen at runtime.

## More examples
The pages directory provides many simple examples for how to use this library.
```bash
npm run dev
```
And navigate to one of the examples using the browser.
