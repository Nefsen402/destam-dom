import {test} from 'node:test';
import assert from 'node:assert';
import './document.js';

import {Observer, OArray, mount, h} from '../index.js';
import {atomic} from 'destam/Network.js';

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
	assert.equal(count, 5);
});
