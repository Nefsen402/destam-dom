import {test} from 'node:test';
import assert from 'node:assert';
import './document.js';

import {OArray, mount, h} from '../index.js';
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
