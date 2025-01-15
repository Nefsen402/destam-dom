import test from 'node:test';
import assert from 'node:assert';
import './document.js';

import {mount, h, OArray} from '../index.js';

const testAssert = (name, cb) => test(name, () => {
	let throwed = false;
	try {
		cb();
	} catch (e) {
		throwed = true;
	}
	assert(throwed);
});

testAssert("assert multiple mount", () => {
	const comp = h('div');
	const elem = document.createElement("body");

	mount(elem, [comp, comp]);
});

testAssert("assert multiple mount dynamic", () => {
	const Component = () => {
		return null;
	};

	const comp = h('div', {}, h(Component));
	const elem = document.createElement("body");

	mount(elem, [comp, comp]);
});

testAssert("mount primitive on null mount", () => {
	const arr = OArray(['a', 'b']);

	mount(null, arr);
});

testAssert("move element on null mount", () => {
	const arr = OArray([h('div'), h('div')]);

	mount(null, arr);

	arr.splice(0, 2, arr[1], arr[0]);
});

testAssert("move element on null mount", () => {
	const arr = Observer.mutable([h('div'), h('div')]);

	mount(null, arr);

	arr.set([arr.get()[1], arr.get()[0]]);
});

test("assert undefined children", () => {
	h('div', {children: undefined});
});

test("assert undefined children", () => {
	h('div', {children: null});
});

testAssert("assert object children", () => {
	h('div', {children: {}});
});

test("assert object children", () => {
	h('div', {children: []}, 'hello');
});

testAssert("assert object children", () => {
	h('div', {children: ['world']}, 'hello');
});

test("assert object children", () => {
	h('div', {children: null}, 'hello');
});

test("assert object children", () => {
	h('div', {children: undefined}, 'hello');
});
