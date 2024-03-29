import {mount,  Observer, html} from '/index.js';

let elements = ['one', 'two', 'three'].map(name => document.createTextNode(name));

mount(document.body, html`
	<div>
		<div> Before switcher </div>
		${Observer.timer(500).map(i => elements[i % elements.length])}
		<div> After switcher </div>
	</div>
`);
