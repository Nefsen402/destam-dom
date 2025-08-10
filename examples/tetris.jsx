import { OArray, OObject, Observer } from 'destam-dom';

const rand = max => Math.floor(Math.random() * max);

const colors = [
	'red',
	'green',
	'blue',
	'orange',
	'brown',
	'cyan',
	'purple',
	'magenta',
];

const tetrads = [
	0x0F, // line
	0x17, // backwards L piece
	0x47, // L piece
	0x66, // square
	0x63, // S piece
	0x27, // T piece
	0x36, // backwards L piece
];

const HEIGHT = 20;
const WIDTH = 10;

const board = OArray();
const nextPiece = Observer.mutable({color: rand(colors.length), id: rand(tetrads.length)});
const gameSpeed = Observer.mutable(600);
const score = Observer.mutable(0);

for (let y = 0; y < HEIGHT; y++) {
	const row = OArray();
	for (let x = 0; x < WIDTH; x++) {
		row.push(OObject({active: false}));
	}

	row.observer.skip().path('dropping').watch(() => {
		let full = true;
		for (let x = 0; x < row.length; x++) {
			if (!row[x].active || row[x].dropping) {
				full = false;
				break;
			}
		}

		if (full) {
			let i = board.indexOf(row);
			board.splice(i, 1);

			for (let x = 0; x < row.length; x++) row[x].active = false;

			board.splice(0, 0, row);
			score.set(score.get() + 1);
		}
	});

	board.push(row);
}

const insertPiece = (piece) => {
	const x = Math.ceil(WIDTH / 2) - 2;

	const insert = [];
	let gameOver = false;
	for (let i = 0; i < 8; i++) {
		const pos = {x: x + (i & 0x3), y: (i & 0x4) >> 2};
		if (!(tetrads[piece.id] & (1 << i))) continue;

		insert.push(pos);

		if (board[pos.y][pos.x].active) {
			gameOver = true;
		}
	}

	if (gameOver) {
		// clear the board then drop the piece like nothing happened to keep the game going
		for (let y = 0; y < board.length; y++) {
			const row = board[y];
			for (let x = 0; x < row.length; x++) {
				row[x].active = false;
			}
		}
	}

	for (const ins of insert) {
		const cell = board[ins.y][ins.x];
		cell.color = piece.color;
		cell.dropping = true;
		cell.active = true;
	}
};

insertPiece(nextPiece.get());
nextPiece.set({color: rand(colors.length), id: rand(tetrads.length)});

const moveDropping = (transform) => {
	const dropping = [];
	for (let y = board.length - 1; y >= 0; y--) {
		const row = board[y];

		for (let x = 0; x < row.length; x++) {
			if (row[x].dropping) {
				dropping.push({x, y, cell: row[x], color: row[x].color});
			}
		}
	}

	// check for collisions
	let collision = false;
	for (const drop of dropping) {
		const [x, y] = transform(drop.x, drop.y, dropping);
		const cell = board[y]?.[x];
		if (!cell || (cell.active && !cell.dropping)) {
			collision = true;
			break;
		}
	}

	if (!collision) {
		const modified = new Set();
		for (const drop of dropping) {
			const [x, y] = transform(drop.x, drop.y, dropping);
			const next = board[y][x];
			next.active = true;
			next.dropping = true;
			next.color = drop.color;

			modified.add(next);
		}

		for (const drop of dropping) {
			if (modified.has(drop.cell)) continue;
			drop.cell.dropping = false;
			drop.cell.active = false;
		}
	}

	return {collision, dropping};
};

const moveTransform = (xOff, yOff) => (x, y) => [x + xOff, y + yOff];
const rotateTransform = (x, y, dropping) => {
	// calculate bounds
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	for (const drop of dropping) {
		minX = Math.min(minX, drop.x);
		maxX = Math.max(maxX, drop.x);
		minY = Math.min(minY, drop.y);
		maxY = Math.max(maxY, drop.y);
	}

	// calculate rotate axis
	const axisX = Math.ceil((minX + maxX) / 2);
	const axisY = Math.ceil((minY + maxY) / 2);

	return [axisX + y - axisY, axisY + axisX - x];
};

gameSpeed.effect(speed => {
	const interval = setInterval(() => {
		const {collision, dropping} = moveDropping(moveTransform(0, 1));

		if (collision) {
			for (const cell of dropping) {
				cell.cell.dropping = false;
			}

			insertPiece(nextPiece.get());
			nextPiece.set({color: rand(colors.length), id: rand(tetrads.length)});
		}
	}, speed);

	return () => clearInterval(interval);
});

window.addEventListener('keydown', e => {
	if (e.key === 'ArrowLeft') {
		moveDropping(moveTransform(-1, 0));
	} else if (e.key === 'ArrowRight') {
		moveDropping(moveTransform(1, 0));
	} else if (e.key === 'ArrowDown') {
		gameSpeed.set(50);
	} else if (e.key === 'ArrowUp') {
		moveDropping(rotateTransform);
	}
});

window.addEventListener('keyup', e => {
	if (e.key === 'ArrowDown') {
		gameSpeed.set(750);
	}
});

const Cell = ({each: cell}) => {
	return <div $style={{
		width: '20px',
		height: '20px',
		background: cell.observer.path('active').map(active => {
			if (!active) return 'none';

			return cell.observer.path('color').map(color => colors[color]);
		}).unwrap(),
	}} />;
};

const BoardRow = ({each: row}) => <div style="display: flex; flex-direction: row; gap: 2px;">
	<Cell each={row} />
</div>;

const piecePreview = tetrads.map(tetrad => {
	const cells = [];
	for (let i = 0; i < 8; i++) {
		const pos = {x: (i & 0x3), y: (i & 0x4) >> 2};

		cells.push(<div $style={{
			width: '20px',
			height: '20px',
			background: (tetrad & (1 << i)) ? nextPiece.map(next => colors[next.color]) : 'none',
		}} />);
	}
	return <div style="background: black; padding: 23px 3px;">
		<div style="display: flex; flex-direction: row;">{cells.slice(0, 4)}</div>
		<div style="display: flex; flex-direction: row;">{cells.slice(4, 8)}</div>
	</div>
});

export default <div style="position: absolute; inset: 0px; display: flex; justify-content: center; align-items: center;">
	<div style="display: flex; flex-direction: row; gap: 10px">
		<div style="background: black; display: flex; flex-direction: column; gap: 2px;">
			<BoardRow each={board} />
		</div>
		<div style="display: flex; flex-direction: column; gap: 5px;">
			<div>Score: {score}</div>
			<div>
				Next piece:
				{nextPiece.map(next => piecePreview[next.id])}
			</div>
		</div>
	</div>
</div>
