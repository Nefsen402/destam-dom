import {h} from 'destam-dom';
import OObject from 'destam/Object';
import OArray from 'destam/Array';
import Observer from 'destam/Observer';

const width = 28;
const height = 31;
const neighbours = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
const lerp = (x, y, l) => x * (1 - l) + y * l;

const pacmanDirection = Observer.mutable(4);
const bufferedPacmanDirection = Observer.mutable(4);
const pacmanPos = Observer.mutable([14, 23.5]);
const score = Observer.mutable(0);
const ghosts = OArray();
const dead = Observer.mutable(0);

const blinky = OObject({ // blinky
	x: 14,
	y: 14.5,
	dir: 4,
	color: 'red',
	mode: 'caged',
	home: [0, 0],

	chaseTile: () => pacmanPos.get(),
});

ghosts.push(blinky);

ghosts.push(OObject({ // pinky
	x: 14,
	y: 14.5,
	dir: 4,
	color: 'pink',
	mode: 'caged',
	home: [width, 0],

	chaseTile () {
		let [x, y] = pacmanPos.get();
		const dir = pacmanDirection.get();
		x += neighbours[pacmanDirection.get()][0] * 4;
		y += neighbours[pacmanDirection.get()][1] * 4;

		return [x, y];
	},
}));

ghosts.push(OObject({ // inky
	x: 14,
	y: 14.5,
	dir: 4,
	color: 'cyan',
	mode: 'caged',
	home: [width, height],

	chaseTile () {
		let [x, y] = pacmanPos.get();
		x += neighbours[pacmanDirection.get()][0] * 2;
		y += neighbours[pacmanDirection.get()][1] * 2;

		return [
			x - (x - blinky.x) * 2,
			y - (y - blinky.y) * 2,
		];
	},
}));

ghosts.push(OObject({ // pokey
	x: 14,
	y: 14.5,
	dir: 4,
	color: 'orange',
	mode: 'caged',
	home: [0, height],

	chaseTile () {
		let [x, y] = pacmanPos.get();

		const xx = x - this.x;
		const yy = y - this.y;

		if (xx * xx + yy * yy < 64) {
			return this.home;
		} else {
			return [x, y];
		}
	},
}));

const timeouts = new Map();
ghosts.observer.skip().path('mode').watch(delta => {
	clearTimeout(timeouts.get(delta.parent));

	if (delta.value === 'afraid') {
		timeouts.set(delta.parent, setTimeout(() => {
			delta.parent.mode = 'chase';
		}, 10000));
	}
});

const svg = (name, prop, ...children) => {
	return h(document.createElementNS("http://www.w3.org/2000/svg", name), prop, ...children);
};

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

const BLOCK_EMPTY = 0;
const BLOCK_WALL = 1;
const BLOCK_POINT = 2;
const BLOCK_UPGRADE = 3;
const BLOCK_DOOR = 4;
const BLOCK_CAGE = 5;

const board = createMultiArray(() => {
	return Observer.mutable(BLOCK_POINT);
}, width, height);

const set = (x, y, block) => {
	board[x]?.[y]?.set(block);
	board[width - 1 - x]?.[y]?.set(block);
};

const draw = (x, y, w, h, fill = BLOCK_EMPTY) => {
	for (let i = x; i <= x + w; i++) set(i, y, BLOCK_WALL);
	for (let i = x; i <= x + w; i++) set(i, y + h, BLOCK_WALL);
	for (let i = y; i <= y + h; i++) set(x, i, BLOCK_WALL);
	for (let i = y; i <= y + h; i++) set(x + w, i, BLOCK_WALL);

	for (let xx = x + 1; xx < x + w; xx++) {
		for (let yy = y + 1; yy < y + h; yy++) {
			set(xx, yy, fill);
		}
	}
};

// outline
draw(0, 0, 13, 0);
draw(13, 1, 0, 3);
draw(0, 0, 0, 9);
draw(-1, 9, 6, 4);
draw(-1, 15, 6, 4);
draw(0, 19, 0, 11);
draw(0, 24, 2, 1);
draw(0, 30, 15, 0);

// top elements
draw(2, 2, 3, 2);
draw(7, 2, 4, 2);
draw(2, 6, 3, 1);
draw(7, 6, 1, 7);
draw(9, 9, 2, 1);
draw(10, 6, 3, 1);
draw(13, 6, 0, 4);

// ghost box
draw(10, 12, 7, 4, BLOCK_CAGE);

// bottom elements
draw(7, 15, 1, 4);
draw(2, 21, 3, 1);
draw(4, 21, 1, 4);
draw(2, 27, 9, 1);
draw(7, 24, 1, 2);
draw(7, 21, 4, 1);
draw(10, 24, 2, 1);
draw(13, 24, 0, 4);
draw(10, 18, 2, 1);
draw(13, 18, 0, 4);

// details
draw(-1, 13, 6, 2);
set(5, 14, BLOCK_EMPTY);
set(5, 14, BLOCK_EMPTY);
set(13, 23, BLOCK_EMPTY);
set(1, 3, BLOCK_UPGRADE);
set(1, 23, BLOCK_UPGRADE);

set(13, 12, BLOCK_DOOR);

const svgGenerateWall = (x, y, block, stroke) => {
	return Observer.all(neighbours.map(([xoff, yoff]) =>
			board[x + xoff]?.[y + yoff]
			?? Observer.immutable(-1))).map(neigh => {
		let i = 1;
		for (; neigh[i] === BLOCK_WALL || neigh[i] === BLOCK_DOOR || neigh[i] === -1; i += 2);

		let start, end;
		for (let ii = (i - 1) & 0x7; true; ii = (ii - 2) & 0x7) {
			if (neigh[ii] === BLOCK_WALL || neigh[ii] === BLOCK_DOOR) {
				start = ii;
				break;
			}
		}

		for (let ii = (i + 1) & 0x7; true; ii = (ii + 2) & 0x7) {
			if (neigh[ii] === BLOCK_WALL || neigh[ii] === BLOCK_DOOR) {
				end = ii;
				break;
			}
		}

		let d = `M${x + .5 + neighbours[start][0] / 2} ${y + .5 + neighbours[start][1] / 2}`;
		if (start === end) {
			d += `L${x + .5} ${y + .5}`;
		} else if ((start & 2) === (end & 2)) {
			d += `L${x + .5 + neighbours[end][0] / 2} ${y + .5 + neighbours[end][1] / 2}`;
		} else {
			d += `A.5 .5 0 0 ${end === ((start + 6) & 0x7) ? 1 : 0} ${x + .5 + neighbours[end][0] / 2} ${y + .5 + neighbours[end][1] / 2}`;
		}

		return <svg:path d={d} stroke={stroke} />;
	});
}

window.addEventListener('keydown', e => {
	if (e.key === 'ArrowDown') {
		bufferedPacmanDirection.set(6);
	} else if (e.key === 'ArrowRight') {
		bufferedPacmanDirection.set(4);
	} else if (e.key === 'ArrowLeft') {
		bufferedPacmanDirection.set(0);
	} else if (e.key === 'ArrowUp') {
		bufferedPacmanDirection.set(2);
	} else {
		return;
	}

	e.preventDefault();
});

const upgradeTimer = Observer.timer(200).memo();

Observer.timer(50).effect(() => {
	if (dead.get()) {
		dead.set(dead.get() + 1);
		return;
	}

	let [x, y] = pacmanPos.get();

	const wrap = (x, m) => (x + m) % m;
	const canChangeDir = (x, y) => Math.floor(x + .5) === x + .5 && Math.floor(y + .5) === y + .5;

	if (canChangeDir(x, y)) pacmanDirection.set(bufferedPacmanDirection.get());
	const dir = pacmanDirection.get();

	const tileInDir = (x, y, dir) =>
		board[wrap(Math.floor(x + neighbours[dir][0] * 0.75), width)][wrap(Math.floor(y + neighbours[dir][1] * 0.75), height)].get()

	const tile = tileInDir(x, y, dir);
	if (tile !== BLOCK_WALL && tile !== BLOCK_DOOR) {
		const checkX = wrap(Math.floor(x + neighbours[dir][0]), width);
		const checkY = wrap(Math.floor(y + neighbours[dir][1]), height);
		const checkTile = board[checkX]?.[checkY]?.get();

		if (checkTile === BLOCK_POINT) {
			board[checkX][checkY].set(BLOCK_EMPTY);
			score.set(score.get() + 1);
		} else if (checkTile === BLOCK_UPGRADE) {
			board[checkX][checkY].set(BLOCK_EMPTY);
			score.set(score.get() + 10);

			for (const ghost of ghosts) {
				// reset the mode twice so that the observer gets the event and resets the timers
				if (ghost.mode !== 'caged' && ghost.mode !== 'dead') {
					ghost.mode = 'chase';
					ghost.mode = 'afraid';
				}
			}
		}

		pacmanPos.set([
			wrap(x + neighbours[dir][0] / 2, width),
			wrap(y + neighbours[dir][1] / 2, height),
		]);
	}

	for (const ghost of ghosts) {
		let x = ghost.x, y = ghost.y;
		const behind = (ghost.dir + 4) & 0x7;

		if (Math.abs(x - pacmanPos.get()[0]) < 1 && Math.abs(y - pacmanPos.get()[1]) < 1 && ghost.mode !== 'dead') {
			if (ghost.mode === 'afraid') {
				ghost.mode = 'dead';
			} else {
				dead.set(1);
			}
		}

		let target;
		let currentlyCaged = [BLOCK_CAGE, BLOCK_DOOR].includes(board[Math.floor(x)][Math.floor(y)].get());
		if (ghost.mode === 'dead') {
			target = [14, 14.5];

			if (currentlyCaged) {
				ghost.mode = 'caged';
			}
		} else if (ghost.mode !== 'caged' && currentlyCaged) {
			target = [14, 0];
		} else if (ghost.mode === 'afraid') {
			target = ghost.home;
		} else if (ghost.mode === 'scatter') {
			target = ghost.home;
			if (Math.random() < 0.2) ghost.mode = 'chase';
		} else if (ghost.mode === 'chase'){
			target = ghost.chaseTile();
			if (Math.random() < 0.05) ghost.mode = 'scatter';
		} else if (ghost.mode === 'caged') {
			target = ghost.home;
			if (Math.random() < 0.005) ghost.mode = 'chase';
		}

		const dist = dir => {
			const xx = target[0] - x + neighbours[dir][0];
			const yy = target[1] - y + neighbours[dir][1];

			return xx * xx + yy * yy;
		};

		const newDir = !canChangeDir(x, y) ? ghost.dir : [2, 0, 6, 4]
			.filter(dir => dir !== behind)
			.sort((a, b) => dist(b) - dist(a))
			.concat([behind])
			.filter(dir => {
				const tile = tileInDir(x, y, dir);
				if ((ghost.mode === 'caged' || !currentlyCaged) && ghost.mode !== 'dead' && tile === BLOCK_DOOR) return false;
				return tile !== BLOCK_WALL;
			})
			[0];

		ghost.dir = newDir;
		ghost.x = wrap(neighbours[newDir][0] * .5 + x, width);
		ghost.y = wrap(neighbours[newDir][1] * .5 + y, height);
	}
});

const Ghost = ({each: ghost}) => {
	const r = 0.8;

	const body = Observer.all([
		ghost.observer.path('x'),
		ghost.observer.path('y'),
		Observer.timer(50).map(t => t / 10),
	]).map(([x, y, off]) => {
		const s = 0.3;
		const zigPos = (i) => ((i & 1) ? r : r * 0.6);

		let zig = "";
		let xx = -r + (off % s), i = (off % (s * 2)) < s ? 0 : 1;

		zig += `L${x - r} ${y + lerp(zigPos(i), zigPos(i + 1), (r + xx) / s)}`

		for (; xx < r; xx += s, i++) {
			zig += `L${x + xx} ${y + zigPos(i)}`;
		}

		zig += `L${x + r} ${y + lerp(zigPos(i - 1), zigPos(i), (r - (xx - s)) / s)}`

		return `M${x + r} ${y} A${r} ${r} 0 0 0 ${x - r} ${y} ${zig} Z`;
	});

	const eyes = Observer.all([
		ghost.observer.path('x'),
		ghost.observer.path('y'),
		ghost.observer.path('dir'),
	]).map(([x, y, dir]) => {
		const rx = 0.3 * r, ry = 0.4 * r, ed = 0.4 * r;
		const pf = 0.4;
		const circle = (xx, yy, rx, ry) => {
			xx -= rx;

			return `M${xx} ${yy} A${rx} ${ry} 0 0 0 ${xx + rx * 2} ${yy} A${rx} ${ry} 0 0 0 ${xx} ${yy} Z`;
		};

		const xx = x + neighbours[dir][0] * (r - rx - ed);
		const yy = y + neighbours[dir][1] * 0.2 - 0.2;

		const px = neighbours[dir][0] * (rx * (1 - pf));
		const py = neighbours[dir][1] * (ry * (1 - pf));

		return {
			body: circle(xx - ed, yy, rx, ry) + circle(xx + ed, yy, rx, ry),
			pupil: circle(xx - ed + px, yy + py, rx * pf, ry * pf) + circle(xx + ed + px, yy + py, rx * pf, ry * pf),
		};
	}).memo();

	const zig = Observer.all([
		ghost.observer.path('x'),
		ghost.observer.path('y'),
	]).map(([x, y]) => {
		let s = 0.7;

		let zig = "";
		for (let i = 0; i < 7; i++) {
			zig += `${i === 0 ? 'M' : 'L'}${x + (i - 3.5) / 6 * s} ${y + ((i & 1) ? 0.3 : 0.4)}`;
		}

		return zig;
	});

	return <>
		<svg:path d={body} fill={ghost.observer.path('mode').map(mode => {
			if (mode === 'dead') return 'rgba(0, 0, 0, 0)';
			if (mode === 'afraid') return 'blue';
			return ghost.observer.path('color');
		}).unwrap()} />
		<svg:path d={eyes.map(eye => eye.body)} fill="white" />
		{ghost.observer.path('mode').map(mode => mode === 'afraid').bool(
			<svg:path d={zig} stroke="white" />,
			<svg:path d={eyes.map(eye => eye.pupil)} fill="blue" />
		)}
	</>;
};

export default <>
	<div>
		Score: {score}
	</div>
	<div $style={{
		position: 'relative',
		width: '600px',
	}}>
		<svg:svg viewBox={`0 0 ${width} ${height}`} $style={{
			background: 'black',
			strokeWidth: "0.1",
			strokeLinecap: 'round',
			inset: '0px',
		}}>
			{...board.map((col, x) => {
				return col.map((tile, y) => {
					return tile.map(tile => {
						if (tile === BLOCK_WALL) {
							// look at neighbouring tiles
							return svgGenerateWall(x, y, BLOCK_WALL, "blue");
						} else if (tile === BLOCK_DOOR) {
							// look at neighbouring tiles
							return svgGenerateWall(x, y, BLOCK_DOOR, "pink")
						} else if (tile === BLOCK_POINT) {
							return <svg:circle cx={x + .5} cy={y + .5} r={.1} fill="pink" />;
						} else if (tile === BLOCK_UPGRADE) {
							return upgradeTimer.map(t => {
								if (t & 1) return null;
								return <svg:circle cx={x + .5} cy={y + .5} r={.4} fill="pink" />;
							});
						}

						return null;
					}).unwrap();
				});
			}).flat(Infinity)}

			<Ghost each={ghosts} />

			<svg:path d={Observer.all([pacmanPos, pacmanDirection, dead]).map(([[x, y], dir, dead]) => {
				const r = .8;
				const arcOff = (dir - 6) * -Math.PI / 4;

				let arc;
				if (dead) {
					arc = Math.min(dead / 5, Math.PI);
				} else {
					arc = (Math.floor(x + .5) === x + .5) !== (Math.floor(y + .5) === y + .5) ? 0.5 : 0.001;
				}

				return `M${x} ${y} L${x + Math.sin(arcOff + arc) * r} ${y + Math.cos(arcOff + arc) * r} A${r} ${r} 0 ${arc < Math.PI / 2 ? 1 : 0} 0 ${x + Math.sin(arcOff - arc) * r} ${y + Math.cos(arcOff - arc) * r} Z`;
			})} fill="yellow" />
		</svg:svg>
		{dead.map(dead => dead / 5 > Math.PI).bool(<div $style={{
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			background: 'black',
			color: 'white',
			position: 'absolute',
			inset: '0px',
		}}>
			<div>
				Game Over
			</div>
		</div>, null)}
	</div>
</>;
