import {mount, OArray, Observer} from 'destam-dom';

const size = 500;
const transitionDuration = 200;

// use a sparse array for rendering
const tiles = OArray();

const createTile = (value, x, y) => {
	if (!value) value = Math.random() < .5 ? 2 : 4;
	value = Observer.mutable(value);
	x = Observer.mutable(x);
	y = Observer.mutable(y);
	const zIndex = Observer.mutable(0);
	const scale = Observer.mutable(.3);

	const ret = {
		value, x, y, zIndex, scale
	};

	tiles.push(ret);
	return ret;
};

const grid = []
const unset = {};
for (let i = 0; i < 4; i++) {
	grid.push([unset, unset, unset, unset]);
}

const randomElement = arr => arr[Math.floor(Math.random() * arr.length)];
const getEmptySlots = () => {
	const slots = [];
	for (let x = 0; x < 4; x++) {
		for (let y = 0; y < 4; y++) {
			if (grid[x][y] === unset) slots.push([x, y]);
		}
	}
	return slots;
};


for (let i = 0; i < 2; i++) {
	let [x, y] = randomElement(getEmptySlots());
	grid[x][y] = createTile(0, x, y);
}

document.body.addEventListener('keydown', e => {
	let getGrid;

	if (e.which === 40) { // down
		getGrid = (x, y, set) => grid[x][3 - y] = set || grid[x][3 - y];
	} else if (e.which === 38) { // up
		getGrid = (x, y, set) => grid[x][y] = set || grid[x][y];
	} else if (e.which === 37) { // left
		getGrid = (x, y, set) => grid[y][x] = set || grid[y][x];
	} else if (e.which === 39) { // right
		getGrid = (x, y, set) => grid[3 - y][x] = set || grid[3 - y][x];
	}

	if (getGrid) {
		let didSomething = false;
		for (let x = 0; x < 4; x++) {
			let place = 0;
			let lastCombined = -1;

			for (let y = 0; y < 4; y++) {
				const tmp = getGrid(x, y);
				if (tmp !== unset) {
					getGrid(x, y, unset);

					const prev = place === 0 ? unset : getGrid(x, place - 1);
					if (prev !== unset && prev.value.get() === tmp.value.get() && lastCombined !== place - 1) {
						lastCombined = place - 1;
						place--;
						prev.value.set(prev.value.get() * 2);

						let watch = [
							prev.x.watch(() => tmp.x.set(prev.x.get())).call(),
							prev.y.watch(() => tmp.y.set(prev.y.get())).call(),
						];

						tmp.zIndex.set(-1);
						prev.scale.set(1.3);

						setTimeout(() => {
							for (let w of watch) w.remove();
							let i = tiles.indexOf(tmp);
							tiles.splice(i, 1);
							prev.scale.set(1);
						}, transitionDuration);

						didSomething = true;
					} else {
						if (y !== place) didSomething = true;
						getGrid(x, place, tmp);
					}

					place++;
				}
			}
		}

		// update the positions
		for (let x = 0; x < 4; x++) {
			for (let y = 0; y < 4; y++) {
				if (grid[x][y] !== unset) {
					grid[x][y].x.set(x);
					grid[x][y].y.set(y);
				}
			}
		}

		if (didSomething) {
			let [x, y] = randomElement(getEmptySlots());
			grid[x][y] = createTile(0, x, y);
		}
	}
});

const colors = {
	2: 'white',
	4: '#FED',
	8: '#FBB',
	16: '#F99',
	32: '#F77',
	64: '#F55',
	128: '#F95',
	256: '#FF5',
};

const Tile = ({each: {value, x, y, zIndex, scale}}, cleanup, mount) => {
	const opacity = Observer.mutable(0);

	mount(() => {
		requestAnimationFrame(() => requestAnimationFrame(() => {
			opacity.set(1);
			scale.set(1);
		}));
	});

	return <div $style={{
		width: (size / 4 - 10) + 'px',
		height: (size / 4 - 10) + 'px',
		position: 'absolute',
		top: y.map(y => (y * (size / 4)) + 'px'),
		left: x.map(x => (x * (size / 4)) + 'px'),
		padding: '5px',
		transition: `all ${transitionDuration}ms`,
		zIndex,
	}}>
		<div $style={{
			borderRadius: '5px',
			background: value.map(val => colors[val]),
			color: value.map(val => val > 16 ? '#DDD' : '#333'),
			height: '100%',
			fontSize: '60px',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			inset: '0px',
			fontFamily: 'sans-serif',
			transition: `all ${transitionDuration}ms`,
			opacity,
			transform: scale.map(scale => `scale(${scale})`),
		}}>
			{value}
		</div>
	</div>;
};

mount(document.body, <>
	<div style="display: flex; align-items: center; justify-content: center; inset: 0px; position: absolute;">
		<div style={`width: ${size}px; height: ${size}px; position: relative; border-radius: 10px; background: #222; zIndex: -2`}>
			<Tile each={tiles} />
		</div>
	</div>
</>);
