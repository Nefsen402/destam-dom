import {mount} from 'destam-dom';

const createContext = () => {
	const getter = Symbol();

	const Context = ({value, children}, cleanup, mounted) => {
		// span is the only element that won't affect page layout so use that as a wrapper.
		const Span = <span />;
		Span[getter] = value;

		return <Span>{children}</Span>;
	};

	Context.use = (component) => (props, cleanup, mounted, parentElement) => {
		let current = parentElement, val;
		while (current) {
			if (getter in current) {
				val = current[getter];
				break;
			}

			current = current.parentNode;
		}

		return component(val)(props, cleanup, mounted, parentElement);
	};

	return Context;
};

const Context = createContext();
const Rect = Context.use(value => () => {
	return <div $style={{...value, width: '100px', height: '100px'}} />;
});


mount(document.body, <div>
	<Context value={{background: 'blue'}}>
		<Rect />
	</Context>
	<Context value={{background: 'red'}}>
		<Rect />
	</Context>
</div>)