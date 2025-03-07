import test from 'node:test';
import assert from 'node:assert';
import './document.js';

import {mount, h, OArray, html} from '../index.js';

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

testAssert("assert object children", () => {
	h('div', {children: {}});
});

testAssert("assert object children", () => {
	h('div', {children: ['world']}, 'hello');
});

testAssert("assert object children", () => {
	h({});
});

testAssert("assert object children", () => {
	h(null);
});

testAssert("assert object children", () => {
	h(undefined);
});

testAssert("assert html unterminated comment", () => {
	html("<!--");
});

testAssert("assert html unterminated node", () => {
	html("<div>");
});

testAssert("assert html wrong termination", () => {
	html("<div></span>");
});

testAssert("assert html unbalanced termination", () => {
	html("</span>");
});

testAssert("assert html unbalanced termination shorthand", () => {
	html("</>");
});

testAssert("assert html invalid tag", () => {
	html("<hello></>");
});

testAssert("assert useless chlidren prop", () => {
	html(`<div children=${[1, 2]}></>`);
});

testAssert("assert mount to invalid element", () => {
	mount({}, null);
});

testAssert("assert mount nonsense to each", () => {
	const Comp = () => null;

	mount(document.dummy, h(Comp, {each: {}}));
});

testAssert("assert mount nonsense to each from observer", () => {
	const Comp = () => null;
	let obs = Observer.mutable([]);

	mount(document.dummy, h(Comp, {each: obs}));
	obs.set({});
});
