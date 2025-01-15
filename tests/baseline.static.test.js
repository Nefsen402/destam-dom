import {test} from 'node:test';
import assert from 'node:assert';
import './document.js';

import {mount, h} from '../index.js';

test("mount null", () => {
	const elem = document.createElement("body");

	mount(elem, null);

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
});

test("mount text", () => {
	const elem = document.createElement("body");

	mount(elem, "Hello World");

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["Hello World"],
	});
});

test("mount 0", () => {
	const elem = document.createElement("body");

	mount(elem, 0);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["0"],
	});
});

test("mount number", () => {
	const elem = document.createElement("body");

	mount(elem, 1);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1"],
	});
});

test("mount boolean", () => {
	const elem = document.createElement("body");

	mount(elem, false);
	mount(elem, true);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["false", "true"],
	});
});

test("mount array", () => {
	const elem = document.createElement("body");

	mount(elem, [1, 2, 3]);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1", "2", "3"],
	});
});

test("mount node", () => {
	const elem = document.createElement("body");
	const node = document.createElement('div');

	mount(elem, h(node));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
		}],
	});
});

test("mount null in node", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {}, null));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{name: 'div'}]
	});
});

test("mount node null children", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {children: null}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{name: 'div'}]
	});
});

test("mount node explicit children", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {children: [1, 2]}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			children: ["1", "2"]
		}]
	});
});

test("mount node explicit nested children", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {children: [[1, 2, [3, 4]]]}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			children: ["1", "2", "3", "4"]
		}]
	});
});

test("mount node explicit nested children 2", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {children: [[1, 2], [3, 4]]}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			children: ["1", "2", "3", "4"]
		}]
	});
});

test("mount node undeterminate children", () => {
	const elem = document.createElement("body");

	const children = [1, 2];
	mount(elem, h('div', {children}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			children: ["1", "2"]
		}]
	});
});

test("mount iterable", () => {
	const elem = document.createElement("body");

	const set = new Set([1, 2, 3]);
	mount(elem, set.keys());

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1", "2", "3"],
	});
});

test("mount div", () => {
	const elem = document.createElement("body");

	mount(elem, h('div'));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
		}],
	});
});

test("mount div with attribute", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {val: 'hello'}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			attributes: {val: 'hello'}
		}],
	});
});

test("mount div with bool attribute", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {val: true}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			attributes: {val: ''}
		}],
	});
});

test("mount div with attribute with normalizer", () => {
	const elem = document.createElement("body");

	let val = 0;
	mount(elem, h('div', {val: val + 1}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			attributes: {val: "1"}
		}],
	});
});

test("mount div with spread attribute", () => {
	const elem = document.createElement("body");

	const s = {val: 'hello'};

	mount(elem, h('div', {...s}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			attributes: {val: 'hello'}
		}],
	});
});

test("mount div with spread style", () => {
	const elem = document.createElement("body");

	const s = {val: 'hello'};

	mount(elem, h('div', {$style: {...s}}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			style: {val: 'hello'}
		}],
	});
});

test("mount div with computed style property", () => {
	const elem = document.createElement("body");

	const prop = 'hello';

	mount(elem, h('div', {$style: {[prop]: 'hello'}}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			style: {[prop]: 'hello'}
		}],
	});
});

test("mount div with property", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {$val: 'hello'}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			val: 'hello',
		}],
	});
});

test("mount div with property with spaces", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {"$hello world": 'hello'}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			"hello world": 'hello'
		}],
	});
});

test("mount div with property with computed value", () => {
	const elem = document.createElement("body");

	let prop = 'hello'
	mount(elem, h('div', {[prop]: 'hello'}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			attributes: {[prop]: 'hello'}
		}],
	});
});

test("mount div with nested property", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {$style: {hello: 'world'}}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			style: {
				hello: 'world',
			}
		}],
	});
});

test("mount div with undeterminate nested property", () => {
	const elem = document.createElement("body");

	const style = {hello: 'world'};
	mount(elem, h('div', {$style: style}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			style: {
				hello: 'world',
			}
		}],
	});
});

test("mount div with nested property removal", () => {
	const elem = document.createElement("body");

	const remove = mount(elem, h('div', {$style: {hello: 'world'}}));
	remove();

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
});

test("mount custom element", () => {
	const elem = document.createElement("body");

	const custom = () => {
		return "hello";
	};

	mount(elem, h(custom));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["hello"],
	});
});

test("mount to null", () => {
	const div = document.createElement("div");

	mount(document.dummy, h(div, {prop: 'prop'}));

	assert.deepEqual(div.tree(), {
		name: 'div',
		attributes: {prop: 'prop'},
	});
});

test("mount to null and remove", () => {
	const div = document.createElement("div");

	const remove = mount(document.dummy, h(div, {prop: 'prop'}));
	remove();

	assert.deepEqual(div.tree(), {
		name: 'div',
		attributes: {prop: 'prop'},
	});
});

test("mount node as child", () => {
	const div = document.createElement("div");

	const remove = mount(document.dummy, h(div, {}, document.createTextNode(0)));
	remove();
});

test("static h tag returns node", () => {
	assert(h('div') instanceof Node);
});

test("static h tag returns node with attribute", () => {
	assert(h('div', {class: 'test'}) instanceof Node);
});

test("static reuse node", () => {
	const elem = document.createElement("body");
	let Elem = document.createElement('div');

	mount(document.dummy, h(Elem, {},
		"Hello world"
	));

	mount(elem, Elem);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			children: ["Hello world"]
		}],
	});
});

test("static h mount 0", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {}, 0));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			children: ["0"]
		}],
	});
});

test("static h mount boolean", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {}, true, false));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			children: ["true", "false"]
		}],
	});
});

test("Redefine h function", () => {
	const h = (name, props, ...children) => {
		return name;
	};

	assert(typeof h('div') === 'string');
});

test("static undefined attribute", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {attrib: undefined}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
		}],
	});
});

test("static null attribute", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {attrib: null}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
		}],
	});
});

test("static undefined property", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {$attrib: undefined}));

	assert(elem.children[0].attrib === undefined);
});

test("static null property", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {$attrib: null}));

	assert(elem.children[0].attrib === null);
});

test("assert object children", () => {
	h('div', {children: null}, 'hello');
});

test("assert object children", () => {
	h('div', {children: []}, 'hello');
});

test("assert undefined children", () => {
	h('div', {children: undefined});
});

test("assert undefined children", () => {
	h('div', {children: null});
});

test("assert object children", () => {
	h('div', {children: undefined}, 'hello');
});
