import {Observer, html, mount} from '/index.js';

const Checkbox = ({value, name}) => {
	return html`
		<label><input type="Checkbox" $checked=${value} $onchange=${cb => {
			value.set(cb.target.checked);
		}} />${name}</label>
		<br/>
	`;
};

const countries = [
	'Australia',
	'Canada',
	'France',
	'USA',
	'Mexico',
	'Japan',
	"dudeooooo"
];

const App = () => {
	const checkboxes = countries.map(name => ({name, value: Observer.mutable(false)}));

	return html`
		<${Checkbox}
			name="Check All"
			value=${Observer.all(checkboxes.map(c => c.value)).map(cbs => {
				return !cbs.some(c => !c);
			}, v => {
				return Array(checkboxes.length).fill(v);
			})}
		/>
		<${({each}) => Checkbox(each)}
			each=${checkboxes}
		/>
	`;
};

mount(document.body, App());
