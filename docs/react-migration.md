# Porting from React

This document explains the key differences in the way you think about components between react and destam-dom. Since react uses a virtual dom and destam-dom doesn't, it's improtant to understand the code lifecycle differences the two libraries have. The document will mainly focus on functional components from both libraries, however the ideas should carry through.

## Virtual dom vs No virtual dom

### Virtual dom and re-rendering

The idea behind the virtual dom is that it's an intermediatory between two parts of your app: The reconciliator and your application code. When a react component renders or re-renderes, that component is responsible for taking the application state through global variables, props, contexts and other means. The program state is then used to generate a virtual dom. That is the only job of the component in react: generate a virtual dom (or at least that's how it ought to be). The reconciliator will then take the virtual dom, compare it with the real dom and only make the necessary changes. React can get away with re-rendering components because of the reconciliator. But this presents a problem: How do you manage lifetimes of objects that might be longer than between two renders? React provise a bunch of hooks to solve this problem (non exaustive list):
 - useState()
 - useEffect()
 - useMemo()

A react component must use these hooks to create lifetimes that extend longer than between two renders.

### JSX as native DOM elements

Components in destam-dom only serve to be a constructor: they only run once when the component is mounted and never again. This is because JSX in destam-dom generates native DOM elements that the browser itself uses. If you see
```jsx
	<div />
```
That actually creates a dom element equivelant to calling `document.createElement('div')`. In fact the above example is often used as a short-hand. Therefore, if we re-render the component in the same way that React does it, we would generate the dom tree all over again from scratch. Fine graned dom mutations would be impossible. To solve this problem, destam-dom uses destam Observers to hold mutating state and listen to that state for as long
as the component is mounted. Lifetimes in destam-dom don't end up being too much of an issue as a result because of the lack of re-rendering. You can safely put initialization code in the constructor and the expected will happen.

## Cheat sheet
 - React.useState(() => default): Observer.mutable(default)
 - React.useEffect(cb, deps): cleanup(Observer.all(deps).effect(cb).remove)
 - React.useEffect(cb, []): constructor / cleanup()
 - const memo = React.useMemo(val): const memo = val
 - React.useLayoutEffect(cb): mounted(cb)
 - React.useEffect(() => destroy): cleanup(destroy)

## Examples

### Basic static component:
```jsx
const ReactComponent = () => {
	return <h1>Hello world</h1>;
};

const DestamComponent = () => {
	return <h1>Hello world</h1>;
};
```

The differences between the two libraries primalily comes down to mutations. For static components with no mutations, the implementations will look identical.

### Basic state:
```jsx
const ReactComponent = () => {
	const [text, setText] = React.useState('');

	window.setText = setText;

	return <h1>{text}</h1>;
};

const DestamComponent = () => {
	const text = Observer.mutable('');

	window.setText = text.set;

	return <h1>{text}</h1>;
};
```

### Transfrom state:
```jsx
const ReactComponent = () => {
	const [text, setText] = React.useState('');

	window.setText = setText;

	return <h1>{text.substring(0, 10)}</h1>;
};

const DestamComponent = () => {
	const text = Observer.mutable('');

	window.setText = text.set;

	return <h1>{text.map(text => text.substring(0, 10))}</h1>;
};
```

Remember, observers represent a box that holds a piece of state, to unwrap the box to transform its value, use Observer.prototype.map()

### Ref:
```jsx
const ReactComponent = ({prop}) => {
	const h1 = React.useRef();

	window.geth1 = () => h1.current;

	return <h1 ref={h1}>{text.substring(0, 10)}</h1>;
};

const DestamComponent = () => {
	const H1 = <h1 />;

	window.geth1 = () => H1;

	return <H1>{text.map(text => text.substring(0, 10))}</H1>;
};
```

### Static props:
```jsx
const ReactComponent = ({close}) => {
	React.useState(() => {
		const handle = (e) => {
			if (e.key === 'Escape') close();
		};

		window.addEventListener('keydown', handle):
		return () => window.removeEventListener('keydown', handle);
	}, []);
};

const DestamComponent = ({close}, cleanup) => {
	const handle = (e) => {
		if (e.key === 'Escape') close();
	};

	window.addEventListener('keydown', handle):
	cleanup(() => window.removeEventListener('keydown', handle));
};
```

### Dynamic props:
(The close prop can mutate during the lifetime of the component)
```jsx
const ReactComponent = ({close}) => {
	React.useState(() => {
		const handle = (e) => {
			if (e.key === 'Escape') close();
		};

		window.addEventListener('keydown', handle):
		return () => window.removeEventListener('keydown', handle);
	}, [close]);
};

const DestamComponent = ({close}, cleanup) => {
	// Observer.immutable ensures close is always an observer of some kind so we
	// don't call .effect() on a random value.
	cleanup(Observer.immutable(close).effect(close => {
		const handle = (e) => {
			if (e.key === 'Escape') close();
		};

		window.addEventListener('keydown', handle):
		return () => window.removeEventListener('keydown', handle);
	}).remove);
};

// This works when the prop value is not part of the dom representation.
const DestamComponentAlternative = ({close}, cleanup) => {
	const handle = (e) => {
		if (e.key === 'Escape') close.get()();
	};

	window.addEventListener('keydown', handle):
	cleanup(() => window.removeEventListener('keydown', handle));
};
```

### Layout effects:
```jsx
const ReactComponent = () => {
	const h1 = React.useRef();

	React.useLayoutEffect(() => {
		h1.current.style.width = '100%';
	}, [h1]);

	return <h1 ref={h1}>{text.substring(0, 10)}</h1>;
};

const DestamComponent = (_, cleanup, mounted) => {
	const H1 = <h1 />;

	mounted(() => {
		H1.style.width = '100%';
	});

	return <H1>{text.map(text => text.substring(0, 10))}</H1>;
};
```

Note that React and destam-dom exhibit slightly different behaviors here: destam-dom being synchronous will call mounted() as soon as the component is mounted and visible from the dom tree. React only performs updates for the most part upon an idle source.

### Static list:
```jsx
const ReactComponent = () => {
	const list = [1, 2, 3];

	return list.map(item => <span>{item}</span>);
};

const DestamComponent = (_, cleanup, mounted) => {
	const list = [1, 2, 3];

	return list.map(item => <span>{item}</span>);
};
```

This is a trick scenario, since we never mutate the list, we are safe to just
immediately compute the entire dom for the destam-dom case during construction.

### Dynamic list:
```jsx
const ReactComponent = () => {
	const [list, setList] = React.useState([]);

	window.addItem = item => setList([...list, item]);

	return list.map(item => <span>{item}</span>);
};

const DestamComponent = (_, cleanup, mounted) => {
	// higher order components are encouraged in destam-dom.
	const ListItem = ({each: item}) => {
		return <span>{item}</span>;
	};

	const list = OArray();

	window.addItem = item => list.push(item);

	return <ListItem each={list} />;
};
```
