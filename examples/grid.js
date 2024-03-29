import {html, mount, Observer} from '/index.js';

function randomHexColorString() {
	return "#" + Math.floor(Math.random() * 16777215).toString(16);
}

const size = Observer.mutable(10);
const blockSize = 500;

const sizeRepeat = size.map(size => `repeat(${size}, ${blockSize / size}px)`);

mount(document.body, html`
	<style>
		.cell {
			outline: 1px solid #efefef;
		}

		body {
			background: black;
			color: white;
		}
	</style>

	Grid Side Length: <input $value=${size} $oninput=${e => size.set(e.target.value)} type=number /><br />

	<div $style=${{display: 'grid', 'grid-template-rows': sizeRepeat, 'grid-template-columns': sizeRepeat}}>
		<${(() => {
			const background = Observer.mutable('initial');
			background.wait(500).watch(() => background.set('initial'));

			return html`
				<div class=cell $style=${{background}} $onmouseenter=${() => {
					background.set(randomHexColorString());
				}} />
			`;
		})} each=${size.map(size => Array.from(Array(size ** 2), (_, i) => i))} />
	</div>
`);
