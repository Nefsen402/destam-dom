import {Observer, html} from 'destam-dom';

let things = Observer.mutable([
	html`<div><input $value="one" /></>`,
	html`<div><input $value="two" /></>`,
]);

setInterval(() => {
	let old = things.get();
	things.set([old[1], old[0]]);
}, 1000);

export default html`
	<${({each: item}) => item} each=${things}/>
	<div><input $value="three" /></>
`;
