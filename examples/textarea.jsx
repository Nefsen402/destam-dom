import {mount, h, Observer} from '..';

const Textarea = ({value, style}) => {
	return <textarea
		$value={value}
		$oninput={e => value.set(e.target.value)}
		$style={{
			resize: 'none',
			...style,
			height: value.map(val => {
				// dynamically change the height of the textarea depending on the value
				let elem = <textarea $value={val} rows={1} $style={{
					resize: 'none',
					padding: '0px',
					...style
				}} />;

				document.body.appendChild(elem);
				const height = elem.scrollHeight;
				document.body.removeChild(elem);

				return height + 'px';
			}),
		}}
	/>;
};

const val = Observer.mutable('');

mount(document.body, <div style={`
	position: absolute;
	inset: 0px;
	display: flex;
	justify-content: center;
	align-items: center;
	flex-direction: column;
`}>
	<div style="padding-bottom: 10px">The text area will automatically expand as type type</div>
	<Textarea value={val} style={{
		width: '300px'
	}} />
</div>);
