destam-dom is designed to be as simple as possible and only provides two functions:
 - mount
 - html

## mount
`mount()` is the entry point for destam-dom to then mount anything it needs onto the real dom. Typically, a mount point of `document.body` will be enough for applications fully written with destam-dom. Let's see a basic example where we mount some text onto the body of the page:

```js
mount(document.body, "Hello, world!");
```

`mount()` also supports mounting to null. This can be useful if you want destam to manage the dom elements, but otherwise you want to mount it yourself.

```js
const div = document.createElement('div');

mount(null, html`
	<${div}>Hello, world!</>
`);

document.body.appendChild(div);
```

Mount supports:
 - Strings
 - Html nodes
 - Arrays (common references will be reconciliated)
 - Any iterable
 - Numbers
 - booleans (will be rendered as the string true/false)
 - `null`
 - Functions (these functions are not the same as what you would see for custom elements, but internally used functions that `html()` generates)

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

Element names can even be expressions! This acts as the way for destam-dom to create refs like in React. In React, because it uses a virtual dom, refs need to have special handling. Because we don't use a virtual dom, we can pass raw html elements directly around.

```js
const div = document.createElement(div);

html`
	<${div} />
`
```

## Custom elements

Element names don't just have to be a reference to an html node, they can also be functions to create custom elements.

```js
const Header = () => {
	return "This is my header!";
};

html`
	<${Header} />
`
```

Note that custom elements can return whatever value is supported by `mount()`.

Custom elements in destam-dom are inspired by functional elements in [React](https://react.dev/). Properties are passed the same way as we would in react:

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
Since destam-dom does not use a virtual dom, the concept of "rendering" does not exist. When a component is mounted, it is invoked once to get a template of what the dom tree should look at and all reactivity is achieved through signals. However, we still have to worry about when a component is mounted and unmounted. This especially critical if you want to create animations.

Custom elements can register callbacks that gen invoked when all descendents of the component are mounted/unmounted.

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
const FadeIn = ({children}, _, mounted) => {
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

Note that the above timer example can be achieved purely with `Observer.timer`.

```js
html`
	${Observer.timer(1000)}
`
```

The lifetime of observers are undefined when used with destam-dom. Do not depend on an observer listener being added/removed for anything more than unregistering the listener when creating custom observers.

## Lists
Custom elements are also the basis of how destam-dom manages rendering a list of items with an arbitrary format. Suppose we have this data that we want to render:

```js
const names = [
	'Bob',
	'Bill',
	'Jane',
];
```

The `each` element property can be used to iterate a list and transform the list into html elements at the same time with a custom element. In the custom component, the `each` property will no longer be the list, but instead an element of the list.

```js
const Name = ({each: name}) => {
	return name;
};

html`
	<${Name} each=${names} />
`
```

Note that destam-dom will compare by reference every value in each to try to reduce rendering nodes. For instance, if `names` was an observer itself, that observer could be updated with a different list and if there are common elements between the old list and the new one, existing element mounts will be reused.

```js
const names = Observer.mutable([
	'Bob',
	'Bill',
	'Jane',
]);

const Name = ({each: name}) => {
	return name;
};

html`
	<${Name} each=${names} />
`

names.set([...names.get(), 'Ford']);
```

In this example, the `Name` custom component will be involked only 4 times. Note that the above example can be further optimized by using an `OArray` provided by destam.

```js
const names = OArray([
	'Bob',
	'Bill',
	'Jane',
]);

const Name = ({each: name}) => {
	return name;
};

html`
	<${Name} each=${names} />
`

names.push('Ford');
```

The optimization here will let destam-dom not need to compare references, but instead just directly the new name in constant time. Prefer these kinds of arrays.

## JSX
JSX support is provided from the `transform/htmlLiteral` file. This can be hooked up to any build system with a vite example being provided in this repository.

The JSX will be similar the html template literals except when it comes to templating node values. Custom elements and html nodes must be capitalized for the build system to understand that a browser html node is not desired, but instead should be a reference.
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
