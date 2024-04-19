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

test("newline whitespace divs", () => {
	assert.deepEqual(
		h`
		<div/>
		<div/>
		<div/>
		`,
		[{name: 'div'}, {name: 'div'}, {name: 'div'}]
	);
});

test("same line whitespace divs", () => {
	assert.deepEqual(
		h`
		<div/> <div/> <div/>
		`,
		[{name: 'div'}, " ", {name: 'div'}, " ", {name: 'div'}]
	);
});

test("same line whitespace", () => {
	assert.deepEqual(
		h`  a  b  `,
		[" a b "]
	);
});

test("newline whitespace", () => {
	assert.deepEqual(
		h`
a
b
		`,
		["a b"]
	);
});

test("whitespace mixed divs and text", () => {
	assert.deepEqual(
		h`
		<div/>
		a
		<div/>
		`,
		[{name: 'div'}, "a", {name: 'div'}]
	);
});

test("whitespace mixed divs and text sameline", () => {
	assert.deepEqual(
		h`
		<div/> a <div/>
		`,
		[{name: 'div'}, " a ", {name: 'div'}]
	);
});

test("htm spreading", () => {
	assert.deepEqual(
		h`<div =${{one: '1', two: '2'}} />`,
		[{name: 'div', props: {one: '1', two: '2'}}]
	);
});

test("htm string parsing quote", () => {
	assert.deepEqual(
		h`<div 'key with spaces'='value with spaces' />`,
		[{name: 'div', props: {"key with spaces": 'value with spaces'}}]
	);
});

test("htm string parsing double quote", () => {
	assert.deepEqual(
		h`<div "key with spaces"="value with spaces" />`,
		[{name: 'div', props: {"key with spaces": 'value with spaces'}}]
	);
});

test("htm comments", () => {
	assert.deepEqual(
		h`<div/><!-- this is a comment --><div />`,
		[{name: 'div'}, {name: 'div'}]
	);
});

test("htm comments with spaces", () => {
	assert.deepEqual(
		h`<div/> <!-- this is a comment --> <div />`,
		[{name: 'div'}, " ", {name: 'div'}]
	);
});
