import {html, mount} from '/index.js';

const cats = [
	{ id: 'J---aiyznGQ', name: 'Keyboard Cat' },
	{ id: 'z_AbfPXTKms', name: 'Maru' },
	{ id: 'OUtn3pvWmpg', name: 'Henri The Existential Cat' }
];

const Cat = ({each: cat}) => {
	const index = cats.indexOf(cat);
	return html`<li>
		<a target="_blank" href=${`https://www.youtube.com/watch?v=${cat.id}`}>
			${index}: ${cat.name}
		</a>
	</li>`;
};

mount(document.body, html`<ul>
	<${Cat} each=${cats} />
</ul>`);
