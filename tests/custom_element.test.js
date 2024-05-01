import {test} from 'node:test';
import assert from 'node:assert';
import './document.js';

import {mount, h} from '../index.js';

const silence = (cb) => () => {
	const orig = console.error;
	console.error = () => {};
	cb();
	console.error = orig;
};

test("custom element", () => {
	const elem = document.createElement("body");

	mount(elem, h(() => {
		return "hello world";
	}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["hello world"],
	});
});

test("custom element cleanup", () => {
	const elem = document.createElement("body");

	let cleaned = false;
	let cleanup = mount(elem, h(({}, cleanup) => {
		cleanup(() => {
			cleaned = true;
		});

		return "hello world";
	}));

	cleanup();
	assert.deepEqual(elem.tree(), {
		name: 'body',
	});

	assert(cleaned);
});

test("custom element empty cleanup", () => {
	const elem = document.createElement("body");

	let cleanup = mount(elem, h(({}, cleanup) => {
		cleanup();

		return "hello world";
	}));

	cleanup();
	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
});

test("custom element empty cleanup no teardown", () => {
	const elem = document.createElement("body");

	mount(elem, h(({}, cleanup) => {
		cleanup();

		return "hello world";
	}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["hello world"]
	});
});

test("custom element cleanup multiple", () => {
	const elem = document.createElement("body");

	let cleaned = false;
	let cleaned2 = false;
	let cleanup = mount(elem, h(({}, cleanup) => {
		cleanup(
			() => cleaned = true,
			() => cleaned2 = true,
		);

		return "hello world";
	}));

	cleanup();
	assert.deepEqual(elem.tree(), {
		name: 'body',
	});

	assert(cleaned);
	assert(cleaned2);
});

test("custom element mounted", () => {
	const elem = document.createElement("body");

	let mounted = false;
	let cleanup = mount(elem, h(({}, cleanup, mounted_) => {
		mounted_(() => {
			mounted = true;
		});

		return "hello world";
	}));

	assert(mounted);
});

test("custom element empty mounted", () => {
	const elem = document.createElement("body");

	mount(elem, h(({}, cleanup, mounted) => {
		mounted();

		return "hello world";
	}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["hello world"]
	});
});

test("custom element mounted multiple", () => {
	const elem = document.createElement("body");

	let mounted = false;
	let mounted2 = false;
	let cleanup = mount(elem, h(({}, cleanup, mounted_) => {
		mounted_(
			() => mounted = true,
			() => mounted2 = true,
		);

		return "hello world";
	}));

	assert(mounted);
	assert(mounted2);
});

test("custom element mounted tree", () => {
	const elem = document.createElement("body");

	let mounted = false;
	let cleanup = mount(elem, h('div', {}, h(({}, cleanup, mounted_) => {
		mounted_(() => {
			assert.deepEqual(elem.tree(), {
				name: 'body',
				children: [{
					name: 'div',
					children: ["hello world"]
				}]
			});
			mounted = true;
		});

		return "hello world";
	})));

	assert(mounted);
});


test("custom element children", () => {
	const elem = document.createElement("body");

	mount(elem, h(({children}) => {
		return children;
	}, {}, 1, 2));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1", "2"]
	});
});

test("custom element custom children", () => {
	const elem = document.createElement("body");

	mount(elem, h(({children}) => {
		return children;
	}, {children: [1, 2]}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1", "2"]
	});
});

test("custom element throw error", silence(() => {
	const elem = document.createElement("body");

	mount(elem, h(({children}) => {
		throw new Error();
	}, {children: [1, 2]}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
}));
