import {test} from 'node:test';
import assert from 'node:assert';
import './document.js';

import {Observer, OArray, mount, h} from '../index.js';
import {atomic} from 'destam/Network.js';

test("array add", () => {
	const elem = document.createElement("body");
	const items = OArray();

	mount(elem, items);

	items.push(1, 2);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1", "2"],
	});
});

test("array removal", () => {
	const elem = document.createElement("body");
	const items = OArray();

	const remove = mount(elem, items);

	items.push(1, 2);
	remove();

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
});

test("array add and remove", () => {
	const elem = document.createElement("body");
	const items = OArray();

	mount(elem, items);

	items.push(1, 2);
	items.splice(0, 1);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["2"],
	});
});

test("array clear", () => {
	const elem = document.createElement("body");
	const items = OArray();

	mount(elem, items);

	items.push(1, 2);
	items.splice(0, 2);

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
});

test("array item replace", () => {
	const elem = document.createElement("body");
	const items = OArray();

	mount(elem, items);

	items.push(1, 2);
	items[0] = 3;

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["3", "2"],
	});
});

test("array item swap", () => {
	const elem = document.createElement("body");
	const items = OArray();

	mount(elem, items);

	items.push(1, 2, 3, 4, 5);
	atomic(() => {
		let tmp = items[1];
		items[1] = items[3];
		items[3] = tmp;
	});

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: "1 4 3 2 5".split(" "),
	});
});

test("array item swap custom element", () => {
	const elem = document.createElement("body");
	const items = OArray();

	let count = 0;
	mount(elem, h(({each}) => {
		count++;
		return each;
	}, {each: items}));

	items.push(1, 2, 3, 4, 5);
	atomic(() => {
		let tmp = items[1];
		items[1] = items[3];
		items[3] = tmp;
	});

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: "1 4 3 2 5".split(" "),
	});
	assert(count === 5);
});

test("array mount order consistency", () => {
	const elem = document.createElement("body");
	const items = OArray();

	const before = Observer.mutable(null);
	const after = Observer.mutable(null);

	mount(elem, [
		before,
		items,
		after,
	]);

	items.push(1, 2, 3, 4, 5);
	before.set(0);
	after.set(0)

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: "0 1 2 3 4 5 0".split(" "),
	});
});
