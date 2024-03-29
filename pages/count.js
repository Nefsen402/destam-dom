import {Observer, OArray, html, mount} from '/index.js';

let arr = OArray([0, 1]);

window.addEventListener('keydown', () => {
	for (let i = 0; i < 10; i++) {
		arr.splice(arr.length - 1, 0, arr.length);
	}
});

mount(document.body, html`
	<${({each}) => html`${each}<br/>`} each=${arr} />
`);
