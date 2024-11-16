import {Observer, html} from 'destam-dom';

let elements = ['one', 'two', 'three'].map(name => document.createTextNode(name));

export default html`
	<div>
		<div> Before switcher </div>
		${Observer.timer(500).map(i => elements[i % elements.length])}
		<div> After switcher </div>
	</div>
`;
