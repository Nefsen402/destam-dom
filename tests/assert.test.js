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

// These run first: testAssert tests throw out of mount mid-algorithm, which
// poisons the module-level deferred queue for everything after them.
const captureError = cb => {
	const orig = console.error;
	const errors = [];
	console.error = e => errors.push(e);
	try { cb(); } finally { console.error = orig; }
	return errors;
};

test("error context names the component and its use site", () => {
	const Inner = () => { throw new Error('boom'); };
	const Middle = () => h('div', {}, h(Inner));
	const App = () => h(Middle);

	const errors = captureError(() => {
		mount(document.createElement('body'), h(App));
	});

	assert.strictEqual(errors.length, 1);
	const msg = errors[0].message;
	assert(msg.startsWith("An error occurred in the Inner component"), msg);
	assert(msg.includes("Inner: Middle ("), msg);
	assert(msg.includes("Middle: App ("), msg);
	assert.strictEqual(errors[0].cause.message, 'boom');
});

test("error context anonymous component", () => {
	const errors = captureError(() => {
		mount(document.createElement('body'), h(() => { throw new Error('x'); }));
	});

	const msg = errors[0].message;
	assert(msg.includes("An error occurred in an anonymous component"), msg);
	assert(msg.includes("<anonymous>"), msg);
});

// Created at module top level: the stack captured by h() has no capitalized
// user frame above the use site, only the module loader's internals.
const TopLevelThrow = () => { throw new Error('top'); };
const topLevelTemplate = h(TopLevelThrow);

test("error context never blames runtime internals", () => {
	const errors = captureError(() => {
		mount(document.createElement('body'), topLevelTemplate);
	});

	const msg = errors[0].message;
	console.log(msg);
	assert(!msg.includes('node:'), msg);
	assert(msg.includes('assert.test.js'), msg);
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
	let obs = Observer.mutable({});

	mount(document.dummy, h(Comp, {each: obs}));
});

testAssert("assert mount nonsense to each from observer mutated", () => {
	const Comp = () => null;
	let obs = Observer.mutable([]);

	mount(document.dummy, h(Comp, {each: obs}));
	obs.set({});
});
