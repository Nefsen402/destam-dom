Note that this documentation assumes that you already know about [destam](https://github.com/Equator-Studios/destam/blob/HEAD/destam/README.md), which this library is built on. This library heavily depends on destam and simply builds on top of it. Destam provides primitives that this library uses in order to implement reactivity.

destam-dom is designed to be as simple as possible and only provides two functions:
 - mount
 - html

## mount
`mount()` is the entry point for destam-dom to then mount anything it needs onto the real DOM. Typically, a mount point of `document.body` will be enough for applications fully written with destam-dom. Let's see a basic example where we mount some text onto the body of the page:

```js
mount(document.body, "Hello, world!");
```

`mount()` also supports mounting to null. This can be useful if you want destam-dom to manage the DOM nodes, but otherwise you want to mount it yourself.

```js
const div = document.createElement('div');

mount(null, html`
	<${div}>Hello, world!</>
`);

document.body.append(div);
```

`mount()` will return a function pointer that can be called to then later unmount. It's likely to see this omitted if the app's lifetime is the same as the mount such as for applications written entirely in destam-dom.
```js
let remove = mount(document.body, "Hello, world!");

setTimeout(() => remove(), 1000);
```
This will only show the text for one second before removing it.

Mount supports:
 - Strings
 - [DOM nodes](https://developer.mozilla.org/en-US/docs/Web/API/Node)
 - [Iterables](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols) (common references will be reconciliated)
 - Numbers
 - booleans (will be rendered as the string true/false)
 - `null` (won't render anything)
 - JSX or `html` tagged template literals
 - Observers that resolve to any of the above

## html
`html()` is meant to be used with tagged template literals and provides an easy and build-free way to start creating complex dom structures in javascript. Note that for cases like the `br` element, you will have to close those manually.

```js
html`
	<div>
		<p>
			This is my website!
		</p>

		<p>
			Welcome visitor!
		</p>
	</div>
`
```

However, we add one addition to destam-dom's flavour of html. In javascript, it's useful to have access to the raw element node because a lot of browser interfaces exist as properties on it. Suppose we are using an `input`. `input` does not understand `value` as an attribute, instead `value` has to be accessed on the element reference directly like so:

```js
const input = document.createElement('input');
input.value = 'my value';
```

destam-dom provides a way set these values without breaking out the elements yourself. This is done by prefixing the attribute with `$`. `$` was chosen because it is compatible with existing jsx parsers.

```js
html`
	<input $value="my value" />
`
```

## Event listeners

Event listeners are managed the same way. In javascript, there are two ways of creating event listeners. One is to use `addEventListener` and another is to set your listener function on the element itself like so:


```js
const button = document.createElement('button');
button.onclick = () => console.log("button was clicked!");
```

This is the way that destam-dom manages event listeners:

```js
html`
	<button $onclick=${() => console.log("button was clicked!")}>Click me!</button>
`
```

Tying this all together, an html definition like this:

```js
html`
	<input autofocus $value="input field" $oninput=${e => console.log(e.target.value)} />
`
```
would provide an element that is equivilent of this vanilla js:
```js
const input = document.createElement('input');
input.setAttribute('autofocus', true);
input.value = 'input field';
input.oninput = e => console.log(e.target.value);
```

Styles are also managed this way. With javascript, a style could be changed:
```js
const button = document.createElement('button');
button.style.background = 'red';
```
This is achieved in destam-dom:
```js
html`
	<button $style=${{
		background: 'red'
	}} />
`
```

## Reactivity
Any part of the template literal can be replaced with an expression for reactivity.

```js
const name = Observer.mutable('visitor');

getUserAuthentication().then(name_ => {
	name.set(name_);
});

html`
	<div>
		<p>
			This is my website!
		</p>

		<p>
			Welcome ${name}!
		</p>
	</div>
`
```

Element names can even be expressions! This acts as the way for destam-dom to create refs like in [React](https://react.dev/). In React, because it uses a virtual dom, refs need to have special handling. Because we don't use a virtual dom, we can pass raw dom nodes directly around.

```js
const div = document.createElement(div);

html`
	<${div} />
`
```

### Undefined foot gun
destam-dom will assert that no value either directly passed or resolved from an observer can be undefined. This is to prevent silly copy paste bugs or just typos. Data that you intend to hide should be null and never undefined.

```js
const state = Observer.mutable();

html`
	My state is ${state}
`
```

The above example would assert on the fact that state will resolve to undefined. In order to fix this, state must be initilazed with null.

```js
const state = Observer.mutable(null);

html`
	My state is ${state}
`
```

This also goes with OObject state.

```js
const state = OObject({});

html`
	My state value is ${state.observer.path('value')}
`
```

state value must be initialized to null.

```js
const state = OObject({
	value: null,
});

html`
	My state value is ${state.observer.path('value')}
`
```

Alternatively, you could map the observer to produce null manually.
```js
const state = OObject({});

html`
	My state value is ${state.observer.path('value').map(val => val ?? null)}
`
```

## Prop spreading
All properties in an object can be used to populate the props of an element. The syntax for this looks like:
```js
html`
	<div =${props} />
`
```

It uses similar syntax for setting any other property, except we leave the propery name blank. Property spreading is especially useful for custom components.

## Children prop

Every element can take in a `children` property that will be used to populate the children of an element. This property must always either be null or an array.

```js
const children = ['hello ', 'world'];

html`
	<div children=${children} />
`
```

The above example will generate the text "hello world" in the div.

Note that if there is a body for the div, even if it is empty, the children property will be ignored.
```js
const children = ['hello ', 'world'];

html`
	<div children=${children}></div>
`
```

This example won't render anything because it is assuming the children in the body, of which there are none.

Note that children must either be null, or a regular javascript array. Children
cannot be an `OArray` as it will not be reactive. This is done for performance
reasons. If you wanted to pass an `OArray` or anything else as a single child,
first wrap it in an array.

## Custom components

Element names don't just have to be a reference to a dom node, they can also be functions to create custom components.

```js
const Header = () => {
	return "This is my header!";
};

html`
	<${Header} />
`
```

Note that custom components can return whatever value is supported by `mount()`.

Custom components in destam-dom are inspired by functional elements in React. Properties are passed the same way as we would in react:

```js
const Header = ({text}) => {
	return text;
};

html`
	<${Header} text="This is my header!" />
`
```

Like React, a special cased `children` property is used for the children of an element.

Note that destam-dom special cases the property names:
 - children
 - each

Every other property name can be used for arbitrary purposes.

```js
const Header = ({children}) => {
	return children;
};

html`
	<${Header}>
		This is my header!
	</>
`
```

## Lifetimes
Since destam-dom does not use a virtual dom, the concept of "re-render"ing does not exist. When a component is mounted, it is invoked once to get a template of what the dom tree should look at and all reactivity is achieved through signals. However, we still have to worry about when a component is mounted and unmounted. This especially critical if you want to create animations.

Custom components can register callbacks that get invoked when all descendents of the component are mounted/unmounted.

When a custom component is first called, that marks the time when the custom component wants to be mounted. Obviously, the children of the component won't yet be on the dom because this is where we are generating the dom elements.

Custom components offer a cleanup function as a second argument that is invoked as soon as the custom component and all its descendants have been unmounted. This is useful for managing resources:

```js
const Timer = ({children}, cleanup, mounted) => {
	let time = Observer.mutable(0);

	const int = setInterval(() => {
		time.set(time.get() + 1);
	}, 1000);

	cleanup(() => clearInterval(int));

	return time;
};

html`
	<${Timer} />
`
```

For a third paramater, custom components offer another callback function after all descendents of the custom component and the custom component itself is mounted. This callback is guaranteed to be invoked when the dom elements that the custom component generates are visible from the root of the mount point.

```js
const FadeIn = ({children}, cleanup, mounted) => {
	const opacity = Observer.mutable(0);

	mounted(() => {
		opacity.set(1);
	});

	return html`
		<div $style=${{
			opacity,
			transition: 'opacity 200ms',
		}}>
			${children}
		<div>
	`;
};

html`
	<${FadeIn}>
		My fade in text
	</>
`

```

Calling cleanup is always valid, even after the component has already been unmounted.
In this case, the cleanup function will immediately be invoked if the component
was unmounted. However, calling mounted is only valid while the component is mounting.

Note that calling cleanup from within mounted is valid:
```js
const Component = ({}, cleanup, mounted) => {
	mounted(() => {
		const timer = setInterval(() => {
			console.log("timer");
		}, 1000);

		cleanup(() => clearInterval(timer));
	});

	return null;
};
```

The cleanup and mount functions can also accept multiple arguments. 0 arguments
is also allowed.
```js
const Component = ({}, cleanup, mounted) => {
	cleanup(
		() => console.log("my first cleanup function was called"),
		() => console.log("my second cleanup function was called"),
	);

	return "my custom component";
};
```

Note that the above timer example can be achieved purely with `Observer.timer`.

```js
html`
	${Observer.timer(1000)}
`
```

The lifetime of observers are undefined when used with destam-dom. Do not depend on an observer listener being added/removed for anything more than unregistering the listener when creating custom observers.

## Lists
Destam can interpret arrays of items like a list of names.

```js
const names = [
	'Bob',
	'Bill',
	'Jane',
];
```

We can transform them into elements and render them. This could also be any sort of iterable, it doesn't necessarily have to be an array.

```js
html`
	${names.map(name => html`<div>${name}</div>`)}
`
```

In order to implement reactivity, an Observer can be used to wrap the array. Destam-dom will reconcile common object references (objects that compare equal in `Map`). If you're used to other frameworks, it's like the objects in the array themselves act as the key. It's easy to lose these object references unfortunately. If we were to generate the div wrappers around names at the last moment such as the above example, those div wrappers would compare as different and everything would be remounted. Instead, we'll store the div wrappers as part of the array.

```js
const names = Observer.mutable([
	html`<div>Bob</div>`,
	html`<div>Bill</div>`,
	html`<div>Jane</div>`
]);

html`
	${names}
`

names.set([...names.get(), html`<div>Ford</div>`]);
```

Hovever, this is a naive way of implementing reactivity with arrays because we require that we copy all elements from the previous array into the new one, to then add one more element. This also means that destam-dom is forced to diff the entire array as well. To achieve constant time insertion, we can use `OArray`.

```js
const names = OArray([
	html`<div>Bob</div>`,
	html`<div>Bill</div>`,
	html`<div>Jane</div>`
]);

html`
	${names}
`

names.push(html`<div>Ford</div>`);
```

This has the added effect that destam-dom does not need to reconcile references. It simply detects that a new item was pushed and adds it to the dom.

## Custom element each property
Sometimes, it's inconventient to need to manage an array of components, you might just have a list of arbitrary program state. Custom components are the basis of how destam-dom manages rendering a list of items with an arbitrary format.

The `each` element property can be used to iterate a list and transform the list into html elements at the same time with a custom element. In the custom element, the `each` property will no longer be the list, but instead an element of the list.

```js
const Name = ({each: name}) => {
	return html`<div>${name}</div>`;
};

html`
	<${Name} each=${names} />
`
```

In this case, the array reconciler will notice that the references are the same, as the references are now just simple strings and prevent unnecessary DOM manipulations.

```js
const names = Observer.mutable([
	'Bob',
	'Bill',
	'Jane',
]);

const Name = ({each: name}) => {
	return ;
};

html`
	<${Name} each=${names} />
`

names.set([...names.get(), 'Ford']);
```

Like above when we weren't using custom components, we can implement naive list reactivity using an observer. This time, we're able to do it with just basic strings. Note that this example will render `Name` exactly 4 times, it will not recompute the first three names.

```js
const names = OArray([
	'Bob',
	'Bill',
	'Jane',
]);

const Name = ({each: name}) => {
	return html`<div>${name}</div>`;
};

html`
	<${Name} each=${names} />
`

names.push('Ford');
```

And of course, prefer to use `OArray` when possible to achieve constant time insertion.

## JSX
JSX support is provided from the `transform/htmlLiteral` file. This can be hooked up to any build system with a vite example being provided in this repository.

The JSX will be similar the html template literals except when it comes to templating node values. Custom components and DOM nodes must be capitalized for the build system to understand that a browser DOM node is not desired, but instead should be a reference.
```jsx
const Website = () => {
	return <p>
		Welcome to my website!
	</p>
};

mount(document.body, <Website />);
```

or for refs:
```jsx
const Div = document.createElement('div');

mount(document.body, <Div />);
```

In `html()`:
```js
html`
	<div>
		<${Header} class=header =${headerProp} />
		<p id=content $onclick=${() => console.log("the paragraph was clicked")}>
			My content
		</p>
	</div>
`
```
if converted to JSX would look like this:
```jsx
<div>
	<Header class="header" {...headerProp} />
	<p id="content" $onclick={() => console.log("the paragraph was clicked")}>
		My content
	</p>
</div>
```

JSX also includes a special shorthand for creating nodes. Because destam-dom does not use a virtual dom and JSX will directly create nodes, for non reactive nodes, the pure node can be returned.

Instead of:
```js
const element = document.createElement('div');
element.setAttribute('class', 'my-div');
```

A JSX shorthand can be used instead:
```jsx
const element = <div class="my-div" />;
```

### Namespaces
Namespaces are also supported through JSX. If you need special handling for certain elements such as SVG, namespaces can be used to use a different hyperscript implementation. If no namespace is specified, `h` is assumed.
```jsx
const myCustomHyperscript = (name, props, ...children) => {
	return document.createElement(name);
};

<myCustomHyperscript:div />;
```
