import OObject from 'destam/Object';
import Observer from 'destam/Observer';

// configuration
const TILE_SIZE = 30;
const WIDTH = 20;
const HEIGHT = 20;
const NUM_MINES = Math.ceil((WIDTH * HEIGHT) / 7);

const TILE_COLORS = [
	null,
	'blue',
	'lime',
	'red',
	'purple',
	'orange',
	'teal',
	'green',
	'white',
];

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

const openField = (board, tile) => {
	const stack = [tile];

	while (stack.length) {
		const tile = stack.pop();
		tile.uncovered = true;

		for (let i = 0; i < 9; i++) {
			let xOffset = i % 3 - 1;
			let yOffset = Math.floor(i / 3) - 1;
			let currentTile = board[tile.x + xOffset]?.[tile.y + yOffset];

			if (!currentTile) continue;
			if (currentTile.uncovered) continue;

			if (currentTile.neighbours === 0) {
				stack.push(currentTile);
			} else {
				currentTile.uncovered = true;
			}
		}
	}
};

const showMines = Observer.mutable(false);

const createBoard = () => {
	const board = createMultiArray((x, y) => {
		const obj = OObject({
			flag: false,
			mine: false,
			uncovered: false,
			neighbours: 0,
			x, y,
		});

		obj.observer.path('uncovered').watch(() => {
			board.uncovered++;

			// won the game
			if (board.uncovered === (WIDTH * HEIGHT) - NUM_MINES) {
				showMines.set(true);
			}
		});

		return obj;
	}, WIDTH, HEIGHT);

	board.uncovered = 0;

	// place the mines
	const choices = board.flat(Infinity);
	for (let i = 0; i < NUM_MINES; i++) {
		const choiceIndex = Math.floor(Math.random() * choices.length);

		choices.splice(choiceIndex, 1)[0].mine = true;
	}

	// calculate the neighbours
	for (const tile of choices) {
		let neighbours = 0;
		for (let i = 0; i < 9; i++) {
			let xOffset = i % 3 - 1;
			let yOffset = Math.floor(i / 3) - 1;

			neighbours += board[tile.x + xOffset]?.[tile.y + yOffset]?.mine ? 1 : 0;
		}

		tile.neighbours = neighbours;
	}

	// start off the board with an open spot
	while (choices.length) {
		const choiceIndex = Math.floor(Math.random() * choices.length);
		const choice = choices.splice(choiceIndex, 1)[0];

		if (!choice.mine && choice.neighbours === 0) {
			openField(board, choice);
			break;
		}
	}

	return board;
};

const wholeBoard = Observer.mutable(createBoard());

const BoardComponent = ({tile, dir}) => {
	if (Array.isArray(tile)) {
		return <div $style={{
			display: 'flex',
			flexDirection: dir,
		}}>
			{...tile.map(tile => <BoardComponent tile={tile} dir="column" />)}
		</div>;
	} else {
		return <div $style={{
			display: 'flex',
			flexDirection: dir,
			width: TILE_SIZE + 'px',
			height: TILE_SIZE + 'px',
			outline: '.5px solid white',

			justifyContent: 'center',
			alignItems: 'center',

			background: tile.observer.path('uncovered').map(unco => {
				if (unco) {
					return 'white';
				} else {
					return 'grey';
				}
			}),

			cursor: tile.observer.path('uncovered').map(unco => {
				return unco ? 'default' : 'pointer';
			}),

			color: TILE_COLORS[tile.neighbours],
		}} $onmousedown={event => {
			event.preventDefault();

			if (showMines.get()) {
				showMines.set(false);
				wholeBoard.set(createBoard());
			} else if (event.button === 2) {
				tile.flag = !tile.flag;
			} else if (event.button === 0) {
				if (tile.flag) return;

				if (tile.mine) {
					showMines.set(true);
					return;
				}

				if (tile.neighbours !== 0) {
					tile.uncovered = true;
				} else {
					openField(wholeBoard.get(), tile);
				}
			}
		}} $oncontextmenu={event => event.preventDefault()}>
			{tile.observer.path('uncovered').map(unco => {
				if (!unco) {
					return Observer.all([
						showMines,
						tile.observer.path('mine'),
						tile.observer.path('flag'),
					]).map(([showMines, mine, flag]) => {
						if (showMines && mine) return '💣';
						if (flag) return '🚩';
						return null;
					});
				}

				if (tile.neighbours) {
					return tile.neighbours;
				} else {
					return null;
				}
			}).unwrap()}
		</div>;
	}
};

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
	}}>
		{wholeBoard.map(board => {
			return <BoardComponent tile={board} dir="row" />;
		})}
	</div>
</div>;
