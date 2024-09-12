import {Observer, mount} from 'destam-dom';

let width, height, ps = 40;

let snake = Observer.mutable(null), snakeLength;
let snakeDirection;
let fruitX, fruitY;
let pw, ph;

const fruit = Observer.mutable(null);
const score = Observer.mutable(null);

const Snake = (x, y, next) => {
	let o = {
		x,
		y,
		next,
	};

	return o;
};

const resize = () => {
	pw = window.innerWidth;
	ph = window.innerHeight;

	width = Math.floor(pw / ps);
	height = Math.floor(ph / ps);
}

const genFruit = () => {
	const taken = new Set();

	let s = snake.get();
	while (s) {
		taken.add(s.x + "-" + s.y);
		s = s.next;
	}

	do {
		fruitX = Math.floor(width * Math.random());
		fruitY = Math.floor(height * Math.random());
	}while (taken.has(fruitX + '-' + fruitY));

	fruit.set(<div $style={{
		position: 'absolute',
		background: 'red',
		width: ps + 'px',
		height: ps + 'px',
		left: (fruitX * ps) + 'px',
		top: (fruitY * ps) + 'px',
	}} />);
}

const reset = () => {
	snake.set(Snake(
		Math.floor(width / 2),
		Math.floor(height / 2)
	));

	snakeLength = 3;
	snakeDirection = 3;
	score.set('New Game');
	genFruit();
}

resize();
reset();

window.addEventListener("keydown", e => {
	let prevDir = -1;
	const s = snake.get();

	if (s.next) {
		const dx = s.next.x - s.x;
		const dy = s.next.y - s.y;

		if (dx) prevDir = dx < 0 ? 0 : 2;
		if (dy) prevDir = dy < 0 ? 1 : 3;
	}

	if (e.which >= 37 && e.which <= 40 && e.which - 37 !== prevDir) {
		snakeDirection = e.which - 37;
	}
});
window.addEventListener("resize", resize);

setInterval(() => {
	let dx = snakeDirection === 0 ? -1 : snakeDirection === 2 ? 1 : 0;
	let dy = snakeDirection === 1 ? -1 : snakeDirection === 3 ? 1 : 0;

	let s = snake.get();

	snake.set(s = Snake(
		(s.x + dx + width) % width,
		(s.y + dy + height) % height,
		s
	));

	if (s.x === fruitX && s.y === fruitY) {
		snakeLength++;
		score.set('Score: ' + (snakeLength - 3));
		genFruit();
	}

	//check for collisions
	let ss = s.next;
	let i = 1;
	while (ss) {
		if (ss.x === s.x && ss.y === s.y) {
			reset();
			break;
		}

		if (++i === snakeLength && ss.next) {
			ss.next = null;
		}
		ss = ss.next;
	}
}, 1000/15);

const SnakeElement = ({each: snake}) => {
	return <div $style={{
		position: 'absolute',
		background: 'black',
		width: ps + 'px',
		height: ps + 'px',
		left: (snake.x * ps) + 'px',
		top: (snake.y * ps) + 'px',
	}} />;
};

mount(document.body, <>
	<SnakeElement each={snake.map(snake => {
		return {
			[Symbol.iterator]: () => {
				let c = snake;

				return {
					next() {
						if (c) {
							let ret = {value: c, done: false};
							c = c.next;
							return ret;
						} else {
							return {done: true};
						}
					}
				}
			}
		};
	})} />
	{fruit}
	<div style="top:0px;right:0px;text-align:right;color:green;position:absolute;">{score}</div>
</>);
