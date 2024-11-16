import {html, OArray, Observer, Synthetic} from 'destam-dom';
import {atomic} from 'destam/Network';

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"],
	colours = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"],
	nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"];

function _random (max) { return Math.round(Math.random() * 1000) % max; };

const Button = (id, text, fn) => {
	return html`<div class='col-sm-6 smallpad'>
		<button id=${id} class='btn btn-primary btn-block' type='button' $onclick=${fn}>${text}</button>
	</div>`
};

const App = () => {
	let selection = Observer.mutable(null);
	let selector = selection.selector('danger', null);
	let duration = Observer.mutable(0);
	let array = OArray();

	const appendData = count => {
		let arr = [];
		for (let i = 0; i < count; i++) {
			const label = Observer.mutable(`${adjectives[_random(adjectives.length)]} ${colours[_random(colours.length)]} ${nouns[_random(nouns.length)]}`);

			const dom = html`
				<tr class=${selector(label)}>
					<td class='col-md-4'><a $clickHandler=${select} $textContent=${label} /></td>
					<td class='col-md-1'><a><span $clickHandler=${remove} class='glyphicon glyphicon-remove' aria-hidden="true" $textContent=x /></a></td>
					<td class='col-md-6'/>
				</tr>
			`;

			dom.label = label;
			arr.push(dom);
		}

		array.push(...arr);
	};

	const
		run = () => {
			let now = performance.now();
			array.splice(0, array.length);
			appendData(1000);
			duration.set(performance.now() - now);
		},
		runLots = () => {
			let now = performance.now();
			array.splice(0, array.length);
			appendData(10000);
			duration.set(performance.now() - now);
		},
		add = () => {
			let now = performance.now();
			appendData(1000);
			duration.set(performance.now() - now);
		},
		update = () => {
			let now = performance.now();
			for(let i = 0, len = array.length; i < len; i += 10)
				array[i].label.set(array[i].label.get() + ' !!!');
			duration.set(performance.now() - now);
		},
		swapRows = () => {
			let now = performance.now();
			if (array.length > 998) {
				atomic (() => {
					let tmp = array[1];
					array[1] = array[998];
					array[998] = tmp;
				});
			}
			duration.set(performance.now() - now);
		},
		clear = () => {
			let now = performance.now();
			array.splice(0, array.length);
			duration.set(performance.now() - now);
		},
		remove = idx => {
			let now = performance.now();
			array.splice(idx, 1);
			duration.set(performance.now() - now);
		},
		select = idx => {
			let now = performance.now();
			selection.set(array[idx].label);
			duration.set(performance.now() - now);
		};

	return html`
		${duration}
		<div class='container'>
			<div class='jumbotron'><div class='row'>
				<div class='col-md-6'><h1>SolidJS Keyed</h1></div>
				<div class='col-md-6'><div class='row'>
					${Button('run', 'Create 1,000 rows', run)}
					${Button('runlots', 'Create 10,000 rows', runLots)}
					${Button('add', 'Append 1,000 rows', add)}
					${Button('update', 'Update every 10th row', update)}
					${Button('clear', 'Clear', clear)}
					${Button('swaprows', 'Swap Rows', swapRows)}
				</div></div>
			</div></div>
			<table class='table table-hover table-striped test-data' $onclick=${ev => {
				if (!ev.target.clickHandler) return;

				let e = ev.target;
				while (e && e.parentElement?.tagName !== "TBODY") e = e.parentElement;
				let i = Array.prototype.indexOf.call(e.parentElement.children, e);
				ev.target.clickHandler(i);
			}}>
				<tbody>
					${array}
				</tbody>
			</table>
			<span class='preloadicon glyphicon glyphicon-remove' aria-hidden="true" />
		</div>
	`;
}

export default App();
