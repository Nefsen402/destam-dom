import {Observer, mount} from 'destam-dom';

const createContext = () => {
	const getter = Symbol();

	const Context = ({value, children}, cleanup, mounted) => {
		// span is the only element that won't affect page layout so use that as a wrapper.
		const Span = <span />;
		Span[getter] = value;

		return <Span>{children}</Span>;
	};

	Context.use = (component) => (props, cleanup, mounted) => {
		const ret = Observer.mutable(null);

		mounted(() => ret.set((elem, _, before) => {
			let current = elem, val;
			while (current) {
				if (getter in current) {
					val = current[getter];
					break;
				}

				current = current.parentNode;
			}

			return mount(elem, component(val)(props, cleanup, mounted), before);
		}));

		return ret;
	};

	return Context;
};

const Context = createContext();
const Rect = Context.use(value => () => {
	return <div $style={{...value, width: '100px', height: '100px'}} />;
});

export default <div>
	<Context value={{background: 'blue'}}>
		<div>
			<Rect />
		</div>
	</Context>
	<Context value={{background: 'red'}}>
		<Rect />
	</Context>
</div>;
