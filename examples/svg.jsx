import {mount, h} from 'destam-dom';
import htm from '/htm.js';

const svg = (name, prop, ...children) => {
	name = document.createElementNS("http://www.w3.org/2000/svg", name);
	return h(name, prop, ...children);
};

mount(document.body,
	<div style="width: 250px">
		<svg:svg viewBox="0 0 100 100">
			<svg:circle cx="50" cy="50" r="50" />
		</svg:svg>
	</div>
);
