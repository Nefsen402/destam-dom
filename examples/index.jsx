import { Observer } from 'destam-dom';

const examples = import.meta.glob("./*.js*");

const current = Observer.mutable(null);
const currentSelector = current.selector();

const Button = ({each: [key, value]}) => {
	const hovered = Observer.mutable(false);

	return <button
		$onclick={() => {
			current.set(key);
		}}
		$onmouseenter={() => hovered.set(true)}
		$onmouseleave={() => hovered.set(false)}
		$style={{
			display: 'block',
			width: '100%',
			height: '40px',
			cursor: 'pointer',
			border: '1px solid #EEEEEE',
			background: Observer.all([hovered, currentSelector(key)])
				.map(([h, sel]) => sel || h ? '#EEEEEE' : 'white'),
		}}
	>
		{key.substring(2)}
	</button>
};

const Example = ({item}) => {
	const out = Observer.mutable(
		<div style="display: flex; position: absolute; inset: 0px; justify-content: center; align-items: center;">
			Loading
		</div>);

	item().then(e => {
		out.set(e.default);
	});

	return out;
};

export default <div style="position: absolute; inset: 0px; display: flex; flex-direction: row">
	<div style="display: flex flex-direction: column; min-width: 200px; height: 100%; overflow-y: scroll">
		<Button each={Object.entries(examples)} />
	</div>
	<div style="position: relative; width: 100%; height: 100%">
		{current.map(c => {
			if (!c) {
				return <div style="display: flex; position: absolute; inset: 0px; justify-content: center; align-items: center;">
					Select an example to start
				</div>;
			}

			return <Example item={examples[c]} />
		})}
	</div>
</div>;
