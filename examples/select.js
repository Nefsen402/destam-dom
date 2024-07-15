import {Observer, html, mount} from 'destam-dom';

const value = Observer.mutable(true);

const map = {
	'open': `あける`,
	'close': `しめる`,
	'eat': `たべる`,
	'drink': `のみる`,
	'know': `しる`,
	'say': `いう`,
	'talk': `はなす`,
};

const selected = Observer.mutable({});

const shown = ({value, children}) => {
	return Observer.immutable(value).map(v => v ? children : null);
};

const Entry = ({each: item, key}) => {
	return html`
		<${shown} value=${item.completed.map(e => !e)}>
			<button
				$style=${{
					display: "block",
					width: "200px",
					height: "45px",
					"font-size": "30px",
					"margin-bottom": "10px",
					"border-radius": "5px",
					background: selected.map(sel => {
						if (sel[key] !== item.completed) {
							return null;
						} else if (!sel.right || !sel.left){
							return '#CCF';
						} else {
							return '#FCC';
						}
					}),
				}}
				$onclick=${() => {
					let sel = selected.get();

					if (sel.left && sel.right && sel.left !== sel.right) {
						sel = {};
					}

					if (sel[key] === item.completed) {
						sel = {...sel, [key]: null};
					} else {
						sel = {...sel, [key]: item.completed};

						if (sel.left === sel.right) {
							item.completed.set(true);
							sel = {};
						}
					}

					selected.set(sel);
				}}
			>
				${item.name}
			</button>
		</>
	`;
};

const List = ({items, key}) => {
	return html`
		<div style="display: inline-block;">
			<${Entry} each=${items} key=${key}/>
		</div>
	`;
}

const Center = ({children}) => {
	return html`
		<div style="left: 50%; top: 50%; position: absolute; transform:translate(-50%, -50%)">
			${children}
		</div>
	`;
}

const App = ({map}, cleanup) => {
	const randomize = items => {
		let l = items.slice();

		for (let i = 1; i < items.length; i++) {
			let r = Math.floor(Math.random() * (i + 1));
			let tmp = l[i];
			l[i] = l[r];
			l[r] = tmp;
		}

		return l;
	};

	const entries = Object.entries(map).map(([key, value]) => {
		const completed = Observer.mutable(false);

		return {
			left: {name: key, completed},
			right: {name: value, completed},
		};
	});

	const left = Observer.mutable(randomize(entries.map(e => e.left)));
	const right = Observer.mutable(randomize(entries.map(e => e.right)));

	cleanup(Observer.all(entries.map(e => e.left.completed)).watch(() => {
		if (!entries.map(e => e.left.completed.get()).some(e => !e)) {
			for (let i = 0; i < entries.length; i++) {
				entries[i].left.completed.set(false);
			}

			left.set(randomize(left.get()));
			right.set(randomize(right.get()));
		}
	}).remove);

	return html`
		<${Center}>
			<${List} items=${left} key="left"/>
			<div style="display: inline-block; width: 30px;" />
			<${List} items=${right} key="right"/>
		</>
		<button style="position: absolute; right: 10px; bottom: 10px" $onclick=${() => {
			left.set(randomize(left.get()));
			right.set(randomize(right.get()));
		}}>Randomize</button>
	`;
}

mount(document.body, html`
	<style>
		body {
			background: black;
		}
	</style>
	<${App} map=${map}/>
`);
