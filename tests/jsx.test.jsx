import {test} from 'node:test';
import assert from 'node:assert';

const h = (name, props = {}, ...children) => {
	const out = {name};

	if (Object.keys(props).length) {
		out.props = props;
	}

	if (children.length) {
		out.children = children;
	}

	return out;
};

test("jsx parse empty fragment", () => {
	assert.deepEqual(<></>, []);
});

test("jsx parse string", () => {
	assert.deepEqual(<>hello world</>, ["hello world"]);
});

test("jsx parse runtime string", () => {
	assert.deepEqual(<>hello {"middle"} world</>, ["hello ", "middle", " world"]);
});

test("jsx parse div", () => {
	assert.deepEqual(<div />, {name: 'div'});
});

test("jsx parse div with attributes", () => {
	assert.deepEqual(
		<div bool hello="world" />,
		{name: 'div', props: {bool: true, hello: "world"}}
	);
});

test("jsx parse div empty body", () => {
	assert.deepEqual(
		<div></div>,
		{name: 'div', children: [null]}
	);
});

test("jsx parse div nested", () => {
	assert.deepEqual(
		<div><div /></div>,
		{name: 'div', children: [{name: 'div'}]}
	);
});

test("jsx newline whitespace divs", () => {
	assert.deepEqual(
		<>
			<div/>
			<div/>
			<div/>
		</>,
		[{name: 'div'}, {name: 'div'}, {name: 'div'}]
	);
});

test("jsx same line whitespace divs", () => {
	assert.deepEqual(
		<><div/> <div/> <div/></>,
		[{name: 'div'}, " ", {name: 'div'}, " ", {name: 'div'}]
	);
});

test("jsx same line whitespace", () => {
	assert.deepEqual(
		<>  a  b  </>,
		[" a b "]
	);
});

test("jsx newline whitespace", () => {
	assert.deepEqual(
		<>
a
b
		</>,
		["a b"]
	);
});

test("jsx whitespace mixed divs and text", () => {
	assert.deepEqual(
		<>
			<div/>
			a
			<div/>
		</>,
		[{name: 'div'}, "a", {name: 'div'}]
	);
});

test("jsx whitespace mixed divs and text sameline", () => {
	assert.deepEqual(
		<>
			<div/> a <div/>
		</>,
		[{name: 'div'}, " a ", {name: 'div'}]
	);
});

test("jsx htm spreading", () => {
	assert.deepEqual(
		<div {...{one: '1', two: '2'}} />,
		{name: 'div', props: {one: '1', two: '2'}}
	);
});