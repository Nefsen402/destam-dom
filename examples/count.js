import {Observer, OArray, html} from 'destam-dom';

let arr = OArray([0, 1]);

window.addEventListener('keydown', () => {
	for (let i = 0; i < 10; i++) {
		arr.splice(arr.length - 1, 0, arr.length);
	}
});

export default html`
	<${({each}) => html`${each}<br/>`} each=${arr} />
`;
