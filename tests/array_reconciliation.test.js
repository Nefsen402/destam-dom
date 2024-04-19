import {test} from 'node:test';
import assert from 'node:assert';
import './document.js';

import {Observer, mount, h} from '../index.js';
import {atomic} from 'destam/Network.js';

test("array replace", () => {
	const elem = document.createElement("body");
	const arr = Observer.mutable([1]);

	mount(elem, arr);

	arr.set([2]);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["2"]
	});
});

test("array reuse", () => {
	const elem = document.createElement("body");
	const arr = Observer.mutable([1]);

	let count = 0;
	mount(elem, h(({each}) => {
		count++;
		return each;
	}, {each: arr}));

	arr.set([2, 1]);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["2", "1"]
	});
	assert(count === 2);
});

test("array reuse duplicates", () => {
	const elem = document.createElement("body");
	const arr = Observer.mutable([1, 1]);

	let count = 0;
	mount(elem, h(({each}) => {
		count++;
		return each;
	}, {each: arr}));

	arr.set([2, 1, 1]);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["2", "1", "1"]
	});
	assert(count === 3);
});

test("array keep focus", () => {
	const elem = document.createElement("body");
	const arr = Observer.mutable([document.createElement("a"), document.createElement("a")]);

	mount(elem, arr);

	arr.get()[0].focus();
	arr.set([arr.get()[1], arr.get()[0]]);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{name: "a"}, {name: "a"}]
	});
	assert(document.activeElement === arr.get()[1]);
});
