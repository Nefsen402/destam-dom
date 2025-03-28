import {h, Observer, OArray, OObject} from 'destam-dom';

const svg = (name, prop, ...children) => {
	return h(document.createElementNS("http://www.w3.org/2000/svg", name), prop, ...children);
};

let rotationSpeed;
let velocityx, velocityy;

const bullets = OArray();
const asteroids = OArray();

let metrics;

let pos = Observer.mutable([0, 0]);
let rotation = Observer.mutable(Math.PI);
const paused = Observer.mutable(0);
const startGame = Observer.mutable(true);

const resetGame = () => {
	metrics = [0, Date.now()];
	startGame.set(false);
	velocityx = velocityy = 0;
	rotationSpeed = 0;
	rotation.set(Math.PI);
	bullets.splice(0);
	asteroids.splice(0);
};

const dist = (x, y) => {
	let dx = x[0] - y[0];
	let dy = x[1] - y[1];
	return Math.sqrt(dx * dx + dy * dy);
};

const intersection = (line1, line2) => {
	//convert first line to standard form
	let a = -line1[3];
	let b = line1[2];
	let c = -a * line1[0] - b * line1[1];

	//calc intersection by substitution
	return (a * line2[0] + b * line2[1] + c) / -(a * line2[2] + b * line2[3]);
};

const timers = [];
const pause = () => {
	paused.set(Date.now());
};

const unpause = () => {
	paused.set(0);
};

const timer = (handler, duration) => {
	const timer = {
		handler: () => {
			let index = timers.indexOf(timer);
			timers.splice(index, 1);
			handler();
		},
		started: Date.now(),
		duration,
	};

	timer.timeout = setTimeout(timer.handler, duration);
	timers.push(timer);
};

paused.watch(delta => {
	if (paused.get()) {
		for (const timer of timers) {
			timer.duration -= Date.now() - timer.started;
			clearTimeout(timer.timeout);
		}
	} else {
		for (const timer of timers) {
			timer.started = Date.now();
			timer.timeout = setTimeout(timer.handler, timer.duration);
		}

		metrics[1] += Date.now() - delta.prev;
	}
});

const simulate = (delta) => {
	delta /= 10;

	if (keys[37] || keys[65]) { // left key
		rotationSpeed += 0.005 * delta;
	}

	if (keys[39] || keys[68]) { // right key
		rotationSpeed -= 0.005 * delta;
	}

	if (keys[38] || keys[87]) { // up key
		velocityx += Math.sin(rotation.get()) * .3 * delta;
		velocityy += Math.cos(rotation.get()) * .3 * delta;
	}

	const [x, y] = pos.get();
	pos.set([x + velocityx * delta, y + velocityy * delta]);

	rotation.set(rotation.get() + rotationSpeed * delta);

	velocityx -= velocityx * 0.1 * delta;
	velocityy -= velocityy * 0.1 * delta;
	rotationSpeed -= rotationSpeed * 0.1 * delta;

	for (let i = 0; i < bullets.length; i++) {
		const bullet = bullets[i];
		bullet.pos = [
			bullet.pos[0] + bullet.dx * delta,
			bullet.pos[1] + bullet.dy * delta,
		];

		if (dist(bullet.pos, pos.get()) > 5000) bullets.splice(i--, 1);
	}

	for (let i = 0; i < asteroids.length; i++) {
		const asteroid = asteroids[i];
		asteroid.pos = [
			asteroid.pos[0] + asteroid.dx * delta,
			asteroid.pos[1] + asteroid.dy * delta,
		];

		if (dist(asteroid.pos, pos.get()) > 5000) {
			asteroids.splice(i--, 1);
			continue;
		}

		// check for player collision
		if (dist(asteroid.pos, pos.get()) < asteroid.radius) {
			metrics[1] = Date.now() - metrics[1];
			startGame.set(metrics);
			return;
		}

		// check for collision with bullets
		for (let ii = 0; ii < bullets.length; ii++) {
			const bullet = bullets[ii];
			const distance = dist(bullet.pos, asteroid.pos);

			if (distance < asteroid.radius) {
				metrics[0]++;

				bullets.splice(ii--, 1);
				asteroids.splice(i--, 1);

				if (asteroid.radius > 40) {
					let children = Math.random() < .5 ? 2 : 3;

					for (let iii = 0 ; iii < children; iii++) {
						asteroids.push(createAsteroid(
							asteroid.radius / 2 + (Math.random() * 2 - 1) * 0.1,
							asteroid.speed,
							asteroid.dir + (Math.random() * 2 - 1) * 0.6,
							asteroid.pos,
						));
					}
				}
			}
		}
	}

};

let lastTimestamp = Date.now();

const frame = (timestamp) => {
	const delta = timestamp - lastTimestamp;
	lastTimestamp = timestamp;

	if (!startGame.get() && !paused.get()) simulate(delta);
	window.requestAnimationFrame(frame);
};

let keys = {};

window.addEventListener('keydown', (e) => {
	keys[e.which] = true;

	if (e.which === 27 && !startGame.get()) {
		if (paused.get()) {
			unpause();
		} else {
			pause();
		}
	}

	if (startGame.get() && (!metrics || e.which === 13)) {
		resetGame();
		genAsteroid();
	}
});

window.addEventListener('keyup', (e) => {
	keys[e.which] = false;
});

window.addEventListener('blur', () => {
	if (!startGame.get() && !paused.get()) {
		pause();
	}
});

const createAsteroid = (radius, speed, dir, pos) => {
	const numPoints = Math.max(3, Math.ceil(radius / 6));

	return OObject({
		pos,
		dx: Math.sin(dir) * speed,
		dy: Math.cos(dir) * speed,
		radius,
		speed,
		dir,
		points: new Array(numPoints).fill(null).map((_, index) => {
			let rot = Math.PI * 2 * index / numPoints;
			const r = radius - Math.random() * radius * .7;

			return {
				x: Math.sin(rot) * r,
				y: Math.cos(rot) * r,
			};
		}),
	});
};

const origviewBox = Observer.mutable([0, 0, 0, 0]);
const viewBox = origviewBox.unwrap();
const Container = ({children}, cleanup, mounted) => {
	const Cont = <div />

	mounted(() => {
		origviewBox.set(Observer.all([
			pos,
			Observer.event(window, 'resize')
		]).map(([[x, y]]) => {
			const w = Cont.clientWidth;
			const h = Cont.clientHeight;
			x -= w / 2;
			y -= h / 2;

			return [x, y, w, h];
		}));
	});

	return <Cont style="position: absolute; inset: 0px;">
		{children}
	</Cont>;
};

const genAsteroid = () => {
	if (startGame.get()) return;
	timer(genAsteroid, (500 + Math.random() * 1000) / ((Date.now() - metrics[1]) / 100000 + 1));

	const rotation = Math.random() * Math.PI * 2;
	const dir = rotation + Math.PI + (Math.random() * 2 - 1) * 0.2;
	const radius = 40 + Math.random() * 40;

	const asteroidVector = [
		...pos.get(),
		Math.sin(rotation), Math.cos(rotation)
	];

	let t = Infinity;
	const view = viewBox.get();
	for (const vector of [
		[view[0] - radius, view[1] - radius, 0, 1],
		[view[0] - radius, view[1] - radius, 1, 0],
		[view[0] + view[2] + radius, view[1] + view[3] + radius, 0, 1],
		[view[0] + view[2] + radius, view[1] + view[3] + radius, 1, 0],
	]) {
		let d = -intersection(vector, asteroidVector);

		if (d > 0 && t > d) {
			t = d;
		}
	}

	const speed = 2 * Math.random() + 2;
	asteroids.push(createAsteroid(radius, speed, dir, [
		asteroidVector[0] + asteroidVector[2] * t,
		asteroidVector[1] + asteroidVector[3] * t,
	]));
};

const shooter = () => {
	timer(shooter, 100);
	if (startGame.get()) return;

	const [x, y] = pos.get();

	if (keys[32]) { // space bar
		const dx = Math.sin(rotation.get());
		const dy = Math.cos(rotation.get());

		bullets.push(OObject({
			pos: [dx * 30 + x, dy * 30 + y],
			dx: dx * 10,
			dy: dy * 10,
		}));
	}
};

timer(shooter, 100);

window.requestAnimationFrame(frame);

const Bullet = ({each: bullet}) => {
	return <svg:circle
		cx={bullet.observer.path('pos').map(p => p[0])}
		cy={bullet.observer.path('pos').map(p => p[1])}
		r="4"
		fill="white"
	/>;
};

const Asteroid = ({each: asteroid}) => {
	return <svg:polygon
		transform={asteroid.observer.path('pos').map(([x, y]) => `translate(${x} ${y})`)}
		stroke="white"
		fill="none"
		points={asteroid.points.map(point => `${point.x},${point.y}`).join(' ')}
	/>;
};

const Shown = ({visible, children}) => visible.map(e => e ? children : null);

export default <Container>
	<style>{`
		body {
			background: black;
		}

		.menu {
			inset: 0;
			display: flex;
			position: absolute;
			justify-content: center;
			align-items: center;
			color: white;
			font-size: 24px;
			font-family: Arial;
			text-align: center;
		}
	`}</style>
	<svg:svg
		style="inset: 0; position: absolute; width: 100%; height: 100%"
		viewBox={viewBox.map(box => box.join(' '))}
	>
		<svg:defs>
			<svg:pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
				<svg:rect fill="#111" x="0" y="0" width="20" height="20" />
				<svg:rect fill="#111" x="20" y="20" width="20" height="20" />
			</svg:pattern>
		</svg:defs>

		<svg:rect
			x={viewBox.map(([x, y]) => x)}
			y={viewBox.map(([x, y]) => y)}
			width="100%"
			height="100%"
			fill="url(#grid)"
		/>

		<Shown visible={Observer.all([paused, startGame]).map(([paused, start]) => !paused && !start)}>
			<Bullet each={bullets} />
			<Asteroid each={asteroids} />
			<svg:polygon
				points="0,30 15,-10 0,0 -15,-10"
				stroke="white"
				fill="none"
				transform={Observer.all([pos, rotation]).map(([[x, y], rot]) => {
					return `translate(${x} ${y}) rotate(${(-rot / Math.PI * 180).toFixed(4)})`;
				})}
			/>
		</Shown>
	</svg:svg>
	<Shown visible={paused}>
		<div class="menu">
			Game paused
		</div>
	</Shown>
	<Shown visible={startGame}>
		<div class="menu">
			{startGame.map(val => {
				if (val === true) return "Press any key to start";
				if (val === false) return null;

				return <>
					Game over press enter to try again<br />
					You destroyed {val[0]} asteroids<br />
					and survived {Math.round(val[1] / 1000)} seconds
				</>;
			})}
		</div>
	</Shown>
</Container>;
