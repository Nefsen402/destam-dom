import OArray, {positionIndex, indexPosition} from 'destam/Array';

const cssColor = col => {
	return `rgb(${col[0] * 255}, ${col[1] * 255}, ${col[2] * 255})`;
};

const Toggle = ({value, tag, color}) => {
	const left = '-3px';
	const right = '24px';

	return <div>
		<div $style={{
			position: 'relative',
			display: 'inline-block',
			marginRight: '10px',
			width: '40px',
			height: '10px',
			borderRadius: '15px',
			transition: 'background 250ms',
			background: value.map(val => val ? cssColor(color.map(col => col * 0.8)) : '#EEE'),
			cursor: 'pointer',
		}} $onclick={() => {
			value.set(!value.get());
		}}>
			<div $style={{
				position: 'absolute',
				borderRadius: '50%',
				width: '18px',
				height: '18px',
				top: '-3.5px',
				transition: 'left 250ms, background 250ms',
				background: value.map(val => val ? cssColor(color) : '#AAA'),
				left: value.map(val => val ? right : left),
			}} />
		</div>
		{tag}
	</div>;
};

const toggles = OArray([false, false, false]);
toggles.observer.watch(delta => {
	if (!toggles.includes(false)) {
		let i = (indexPosition(toggles, delta.path()[0]) + 2) % toggles.length;
		toggles[i] = false;
	}
});

export default <div style="transform: scale(3); transform-origin: top left; padding: 10px">
	<Toggle tag="FAST" color={[1, 0, 0]} value={toggles.observer.path([positionIndex(toggles, 0)])} />
	<Toggle tag="CHEAP" color={[0, 1, 0]}  value={toggles.observer.path([positionIndex(toggles, 1)])} />
	<Toggle tag="GOOD" color={[0, 0, 1]}  value={toggles.observer.path([positionIndex(toggles, 2)])} />
</div>;
