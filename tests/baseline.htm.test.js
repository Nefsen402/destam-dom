import {test} from 'node:test';
import assert from 'node:assert';
import htm from '../htm.js';

const handler = (name, props, ...children) => {
	const out = {name};

	if (props && Object.keys(props).length) {
		out.props = props;
	}

	if (children.length) {
		out.children = children;
	}

	return out;
};

const h = htm(handler);

const unwrap = (thing) => {
	if (Array.isArray(thing)) {
		if (thing.length === 0) return null;
		if (thing.length === 1) return thing[0];
	}
	return thing;
};

test("parse empty string", () => {
	assert.deepEqual(unwrap(h``), null);
});

test("parse string", () => {
	assert.deepEqual(unwrap(h`hello world`), "hello world");
});

test("parse runtime string", () => {
	assert.deepEqual(unwrap(h`hello ${"middle"} world`), ["hello ", "middle", " world"]);
});

test("parse div", () => {
	assert.deepEqual(unwrap(h`<div />`), {name: 'div'});
});

test("parse div with attributes", () => {
	assert.deepEqual(
		unwrap(h`<div bool hello=world />`),
		{name: 'div', props: {bool: true, hello: "world"}}
	);
});

test("parse custom component", () => {
	assert.deepEqual(
		unwrap(h`<custom-component />`),
		{name: 'custom-component'}
	);
});

test("parse div empty body", () => {
	assert.deepEqual(
		unwrap(h`<div></div>`),
		{name: 'div', children: [null]}
	);
});

test("parse div nested", () => {
	assert.deepEqual(
		unwrap(h`<div><div /></div>`),
		{name: 'div', children: [{name: 'div'}]}
	);
});

test("newline whitespace divs", () => {
	assert.deepEqual(
		unwrap(h`
		<div/>
		<div/>
		<div/>
		`),
		[{name: 'div'}, {name: 'div'}, {name: 'div'}]
	);
});

test("same line whitespace divs", () => {
	assert.deepEqual(
		unwrap(h`
		<div/> <div/> <div/>
		`),
		[{name: 'div'}, " ", {name: 'div'}, " ", {name: 'div'}]
	);
});

test("same line whitespace", () => {
	assert.deepEqual(
		unwrap(h`  a  b  `),
		" a b "
	);
});

test("newline whitespace", () => {
	assert.deepEqual(
		unwrap(h`
a
b
		`),
		"a b"
	);
});

test("whitespace mixed divs and text", () => {
	assert.deepEqual(
		unwrap(h`
		<div/>
		a
		<div/>
		`),
		[{name: 'div'}, "a", {name: 'div'}]
	);
});

test("whitespace mixed divs and text sameline", () => {
	assert.deepEqual(
		unwrap(h`
		<div/> a <div/>
		`),
		[{name: 'div'}, " a ", {name: 'div'}]
	);
});

test("htm spreading", () => {
	assert.deepEqual(
		unwrap(h`<div =${{one: '1', two: '2'}} />`),
		{name: 'div', props: {one: '1', two: '2'}}
	);
});

test("htm string parsing quote", () => {
	assert.deepEqual(
		unwrap(h`<div 'key with spaces'='value with spaces' />`),
		{name: 'div', props: {"key with spaces": 'value with spaces'}}
	);
});

test("htm string parsing double quote", () => {
	assert.deepEqual(
		unwrap(h`<div "key with spaces"="value with spaces" />`),
		{name: 'div', props: {"key with spaces": 'value with spaces'}}
	);
});

test("htm comments", () => {
	assert.deepEqual(
		unwrap(h`<div/><!-- this is a comment --><div />`),
		[{name: 'div'}, {name: 'div'}]
	);
});

test("htm nested string", () => {
	assert.deepEqual(
		unwrap(h`
			<div>
				hello world
			</div>
		`),
		{name: 'div', children: ["hello world"]}
	);
});

test("htm nested string shorthand termination", () => {
	assert.deepEqual(
		unwrap(h`
			<div>
				hello world
			</>
		`),
		{name: 'div', children: ["hello world"]}
	);
});

test("htm string literal attribute", () => {
	assert.deepEqual(
		unwrap(h`
			<div val="${"hello"} ${"world"}" />
		`),
		{name: 'div', props: {val: "hello world"}}
	);
});

test("htm comments with spaces", () => {
	assert.deepEqual(
		unwrap(h`<div/> <!-- this is a comment --> <div />`),
		[{name: 'div'}, " ", {name: 'div'}]
	);
});

test("htm arrow function", () => {
	const func = () => h`hello world`;

	assert.deepEqual(unwrap(func()), 'hello world');
});
