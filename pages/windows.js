import {html, mount, OArray, OObject} from '/index.js';
import {atomic} from 'destam/Network';
import {css} from '../util.js';

css`
	.center {
		display: flex;
		align-items: center;
		justify-content: center;
	}
`;

const windows = window.windows = OArray();
let currentInteraction = null;

window.addEventListener('mousemove', e => {
	if (currentInteraction) {
		currentInteraction.drag(e);
	}
});

window.addEventListener('mouseup', e => {
	if (currentInteraction) {
		currentInteraction = null;
	}
});

const Window = ({each: window}) => {
	const sendToTop = () => atomic(() => {
		let index = windows.indexOf(window);
		windows.splice(index, 1);

		windows.push(window);
	});

	const createSizer = type => {
		const style = {
			cursor: type + '-resize',
			position: 'absolute',
			...{
				'n': {left: 0, right: 0},
				's': {left: 0, right: 0},
				'e': {top: 0, bottom: 0},
				'w': {top: 0, bottom: 0},
			}[type]
		};

		if (type.includes('n')) {style.top = 0; style.height = '10px'}
		if (type.includes('s')) {style.bottom = 0; style.height = '10px'}
		if (type.includes('w')) {style.left = 0; style.width = '10px'}
		if (type.includes('e')) {style.right = 0; style.width = '10px'}

		return html`
			<div $style=${style} $onmousedown=${e => {
				e.stopPropagation();
				sendToTop();

				currentInteraction = {
					drag: e => {
						if (type.includes('n')) {
							window.y += e.movementY;
							window.height -= e.movementY;
						}

						if (type.includes('w')) {
							window.x += e.movementX;
							window.width -= e.movementX;
						}

						if (type.includes('s')) {
							window.height += e.movementY;
						}

						if (type.includes('e')) {
							window.width += e.movementX;
						}
					}
				};
			}} />
		`;
	}

	return html`
		<div $style=${{
			position: 'absolute',
			top: window.observer.path('y').map(v => v + 'px'),
			left: window.observer.path('x').map(v => v + 'px'),
			width: window.observer.path('width').map(v => v + 'px'),
			height: window.observer.path('height').map(v => v + 'px'),
			background: 'grey',
		}} >
			<iframe
				src=${window.address}
				style="inset: 0; top: 40px; position: absolute; border: none;"
				width=${window.observer.path('width')}
				height=${window.observer.path('height').map(h => h - 40)}
				$onload=${e => {
					window.name = e.target.title;
				}}
			/>
			<div style="position: absolute; height: 40px; top: 0; left: 0; right: 0" $onmousedown=${(e) => {
				sendToTop();

				currentInteraction = {
					drag: e => {
						window.x += e.movementX;
						window.y += e.movementY;
					}
				};
				e.stopPropagation();
			}}>
				${window.observer.path('name')}
				<div class=center style="position: absolute; right: 0; width: 40px; top: 0; bottom: 0; font-size: 20px; cursor: pointer;" $onclick=${() => {
					let index = windows.indexOf(window);
					windows.splice(index, 1);
				}}>x</div>
			</div>

			<!-- surround the window with click regions used for resize -->
			${['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(createSizer)}
		</div>
	`;
};

mount(document.body, html`
	<button $onclick=${() => {
		windows.push(OObject({
			x: 10,
			y: 10,
			width: 400,
			height: 300,
			name: null,
			address: 'https://ozal.ski/'
		}))
	}}>Open browser</button>
	<${Window} each=${windows} />
`);
