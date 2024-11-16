import {Observer, mount} from 'destam-dom';

const createContext = () => {
	const getter = Symbol();

	const Context = ({value, children}, cleanup, mounted) => {
		return (elem, _, before) => {
			return mount(elem, children, before, value)
		};
	};

	Context.use = (component) => (props, cleanup, mounted) => {
		return (elem, _, before, context) => {
			return mount(elem, component(context)(props, cleanup, mounted), before);
		};
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
