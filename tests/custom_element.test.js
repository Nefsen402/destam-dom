import {test} from 'node:test';
import assert from 'node:assert';
import './document.js';

import {mount, h, Observer} from '../index.js';

const patchedConsole = {...console, error: () => {}};

const silence = (cb) => () => {
	const orig = console;
	global.console = patchedConsole;
	cb();
	global.console = orig;
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

test("custom element into node with all props", () => {
	const elem = document.createElement("body");

	const custom = (props) => {
		return h('div', props, "Hello world");
	};

	mount(elem, h(custom));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			children: ["Hello world"]
		}],
	});
});

test("custom element pass properties", () => {
	const props = {a: 1, b: 2, c: 3, [Symbol()]: {}};
	let passed;

	mount(null, h(props => {
		passed = props;
		return null;
	}, {...props}));

	props.children = [];
	assert.deepEqual(props, passed);
});

test("custom element pass properties and children", () => {
	const props = {a: 1, b: 2, c: 3, [Symbol()]: {}};
	let passed;
	const children = [{}, {}, {}];

	mount(null, h(props => {
		passed = props;
		return null;
	}, {...props}, ...children));

	props.children = children;

	assert.deepEqual(props, passed);
});

test("Pass null children for auto closed component", () => {
	let passed;
	const Comp = ({children}) => {
		passed = children;

		return null;
	};

	mount(null, h(Comp));

	assert.deepEqual(passed, []);
});

test("Remove custom component while mounting", () => {
	const Component = () => {
		comp.set(null);

		return "hello world";
	};

	const comp = Observer.mutable(h(Component));

	const elem = document.createElement("body");
	mount(elem, comp);

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
});

test("Remove custom component while mounting recursive", () => {
	const Component2 = () => {
		comp2.set(null);

		return "hello world";
	};
	const comp2 = Observer.mutable(h(Component2));

	const Component = () => {
		comp.set(null);

		return comp2;
	};

	const comp = Observer.mutable(h(Component));

	const elem = document.createElement("body");
	mount(elem, comp);

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
});

test("Remove custom component while mounting recursive invert", () => {
	const Component2 = () => {
		comp.set(null);

		return "hello world";
	};
	const comp2 = Observer.mutable(h(Component2));

	const Component = () => {
		comp2.set(null);

		return comp2;
	};

	const comp = Observer.mutable(h(Component));

	const elem = document.createElement("body");
	mount(elem, comp);

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
});

test("cleanup after unmount", () => {
	let cleaned = false;
	const Component = (_, cleanup) => {
		comp.set(null);

		cleanup(() => cleaned = true)

		return "hello world";
	};

	const comp = Observer.mutable(h(Component));
	mount(null, comp)();

	assert(cleaned);
});
