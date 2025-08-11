import OObject from 'destam/Object';
import Observer from 'destam/Observer';

// configuration
const TILE_SIZE = 10;
const WIDTH = 75;
const HEIGHT = 75;

const offs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

const createMultiArray = (init, ...dims) => {
	const create = (index, dimIndex) => {
		if (dims.length === index) {
			return init(...dimIndex);
		} else {
			const arr = Array(dims[index]);
			for (let i = 0; i < dims[index]; i++) {
				arr[i] = create(index + 1, [...dimIndex, i]);
			}

			return arr;
		}
	};

	return create(0, []);
};

const board = createMultiArray(() => OObject({state: Math.random() > .5}), WIDTH, HEIGHT);
const slidingWindow = Array(WIDTH * 2);
let slidingWindowPos = slidingWindow.length;

let running = true;
setInterval(() => {
	if (!running) return;

	for (let y = 0; y < HEIGHT; y++) {
		for (let x = 0; x < WIDTH; x++) {
			slidingWindow[slidingWindowPos % slidingWindow.length] = board[x][y].state;

			let neighbours = 0;
			for (const [xx, yy] of offs) {
				if (xx + x < 0 || xx + x >= WIDTH) continue;
				if (yy + y < 0 || yy + y >= HEIGHT) continue;

				if ((xx < 0 && yy === 0) || yy < 0) {
					const ind = slidingWindowPos + yy * WIDTH + xx;

					if (slidingWindow[ind % slidingWindow.length])
						neighbours++;
				} else if (board[x + xx]?.[y + yy]?.state) {
					neighbours++;
				}
			}

			slidingWindowPos++;
			board[x][y].state = neighbours >= 2 && neighbours <= 3 &&
				(board[x][y].state || neighbours === 3);
		}
	}
}, 100);

const Tile = ({each: tile}) => {
	return <div $style={{
		flex: 1,

		background: tile.observer.path('state').map(state => state ? 'white' : 'black'),
	}} $onmousedown={e => {
		tile.state = !tile.state;
	}}/>
};

const Column = ({each: tile}) => {
	return <div $style={{
		background: 'white',
		display: 'flex',
		flexDirection: 'column',
		flex: 1,
		gap: '.5px',
		height: (TILE_SIZE * HEIGHT) + 'px',
	}}>
		<Tile each={tile} />
	</div>
};

window.addEventListener('keydown', e => {
	if (e.which === 32) {
		running = !running;
	}
});

export default <div $style={{
	position: 'absolute',
	inset: '0px',
	background: 'black',
	display: 'flex',
	justifyContent: 'center',
	alignItems: 'center',

	fontFamily: 'roboto',
	fontSize: (TILE_SIZE / 1.5) + 'px',
}}>
	<div $style={{
		background: 'white',
		display: 'flex',
		flexDirection: 'row',
		gap: '.5px',
		outline: '.5px solid white',
		width: (TILE_SIZE * WIDTH) + 'px',
	}}>
		<Column each={board} />
	</div>
</div>;
