import {test} from 'node:test';
import assert from 'node:assert';
import './document.js';

import {mount, h, OArray} from '../index.js';

test("assert multiple mount", () => {
	let throwed = false;
	try {
		const comp = h('div');
		const elem = document.createElement("body");

		mount(elem, [comp, comp]);
	} catch (e) {
		throwed = true;
	}

	assert(throwed);
});

test("assert multiple mount dynamic", () => {
	let throwed = false;
	try {
		const Component = () => {
			return null;
		};

		const comp = h('div', {}, h(Component));
		const elem = document.createElement("body");

		mount(elem, [comp, comp]);
	} catch (e) {
		throwed = true;
	}

	assert(throwed);
});

test("mount primitive on null mount", () => {
	let throwed = false;
		try {
		const arr = OArray(['a', 'b']);

		mount(null, arr);
	} catch (e) {
		throwed = true;
	}

	assert(throwed);
});

test("move element on null mount", () => {
	let throwed = false;
	try {
		const arr = OArray([h('div'), h('div')]);

		mount(null, arr);

		arr.splice(0, 2, arr[1], arr[0]);
	} catch (e) {
		throwed = true;
	}

	assert(throwed);
});

test("move element on null mount", () => {
	let throwed = false;
	try {
		const arr = Observer.mutable([h('div'), h('div')]);

		mount(null, arr);

		arr.set([arr.get()[1], arr.get()[0]]);
	} catch (e) {
		throwed = true;
	}

	assert(throwed);
});
