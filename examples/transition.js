import {html, Observer, OArray} from 'destam-dom';

const Fade = ({children, removed, $style}, cleanup, mounted) => {
	const opacity = Observer.mutable(0);
	const size = Observer.mutable(.7)

	const div = document.createElement('div');

	mounted(() => {
		// force a browser render
		div.scrollWidth;

		opacity.set(1);
		size.set(1);
	});

	cleanup(removed.watch(() => {
		opacity.set(0);
		size.set(.7);
	}));

	return html`
		<${div} children=${children} $style=${{
			opacity,
			transform: size.map(size => `scale(${size})`),
			transition: 'all 200ms',
			...$style
		}}/>
	`;
};

const boxes = OArray();

setInterval(() => {
	let removed = Observer.mutable(false);

	let x = Math.random() * (window.innerWidth - 300);
	let y = Math.random() * (window.innerHeight - 200);

	let background = `rgb(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255})`;

	const box = html`
		<div $style=${{
			position: 'absolute',
			width: '300px',
			height: '200px',
			left: x + 'px',
			top: y + 'px',
		}}>
			<${Fade} removed=${removed} $style=${{
				background,
				height: '100%',
			}} />
		</div>
	`;

	setTimeout(() => {
		removed.set(true);
		setTimeout(() => {
			let i = boxes.indexOf(box);
			boxes.splice(i, 1);
		}, 200);
	}, 3000);

	boxes.push(box);
}, 300);

export default boxes;
