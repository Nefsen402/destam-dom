import {test as nodeTest} from 'node:test';
import assert from 'node:assert';
import './document.js';

import {mount, h, OArray} from '../index.js';

const test = (name, cb) => nodeTest(name, () => {
	let throwed = false;
	try {
		cb();
	} catch (e) {
		throwed = true;
	}
	assert(throwed);
});

test("assert multiple mount", () => {
	const comp = h('div');
	const elem = document.createElement("body");

	mount(elem, [comp, comp]);
});

test("assert multiple mount dynamic", () => {
	const Component = () => {
		return null;
	};

	const comp = h('div', {}, h(Component));
	const elem = document.createElement("body");

	mount(elem, [comp, comp]);
});

test("mount primitive on null mount", () => {
	const arr = OArray(['a', 'b']);

	mount(null, arr);
});

test("move element on null mount", () => {
	const arr = OArray([h('div'), h('div')]);

	mount(null, arr);

	arr.splice(0, 2, arr[1], arr[0]);
});

test("move element on null mount", () => {
	const arr = Observer.mutable([h('div'), h('div')]);

	mount(null, arr);

	arr.set([arr.get()[1], arr.get()[0]]);
});
