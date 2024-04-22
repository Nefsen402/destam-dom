import {mount, h, Observer} from '..';

const Textarea = ({value, style}, _, mounted) => {
	const Ref = <textarea />;

	const isMounted = Observer.mutable(false);
	mounted(() => isMounted.set(true));

	return <Ref
		$value={value}
		$oninput={e => value.set(e.target.value)}
		$style={{
			resize: 'none',
			...style,
			height: isMounted.map(mounted => {
				if (!mounted) return 'auto';

				return value.map(val => {
					// dynamically change the height of the textarea depending on the value
					let elem = <textarea $value={val} $style={{
						resize: 'none',
						paddingTop: '0px',
						paddingBottom: '0px',
						boxSizing: 'border-box',
						...style,
						width: Ref.clientWidth + 'px'
					}} />;

					document.body.appendChild(elem);
					const height = elem.scrollHeight;
					document.body.removeChild(elem);

					return height + 'px';
				}).memo();
			}).unwrap(),
		}}
	/>;
};

const val = Observer.mutable('This destam-dom example has a textarea with text that will wrap');

mount(document.body, <div style={`
	position: absolute;
	inset: 0px;
	display: flex;
	justify-content: center;
	align-items: center;
	flex-direction: column;
`}>
	<div style="padding-bottom: 10px">The text area will automatically expand as you type</div>
	<Textarea value={val} style={{
		width: '300px'
	}} />
</div>);
