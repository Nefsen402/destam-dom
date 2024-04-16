import {test} from 'node:test';
import assert from 'node:assert';
import htm from '../htm.js';

const h = htm((name, props, ...children) => {
	const out = {name};

	if (Object.keys(props).length) {
		out.props = props;
	}

	if (children.length) {
		out.children = children;
	}

	return out;
});

test("parse empty string", () => {
	assert.deepEqual(h``, []);
});

test("parse string", () => {
	assert.deepEqual(h`hello world`, ["hello world"]);
});

test("parse runtime string", () => {
	assert.deepEqual(h`hello ${"middle"} world`, ["hello ", "middle", " world"]);
});

test("parse div", () => {
	assert.deepEqual(h`<div />`, [{name: 'div'}]);
});

test("parse div with attributes", () => {
	assert.deepEqual(
		h`<div bool hello=world />`,
		[{name: 'div', props: {bool: true, hello: "world"}}]
	);
});

test("parse div empty body", () => {
	assert.deepEqual(
		h`<div></div>`,
		[{name: 'div', children: [null]}]
	);
});

test("parse div nested", () => {
	assert.deepEqual(
		h`<div><div /></div>`,
		[{name: 'div', children: [{name: 'div'}]}]
	);
});
