import Observer, {observerGetter, shallowListener} from 'destam/Observer.js';
import {Insert, Modify, Delete} from 'destam/Events.js';
import {isInstance, len, push, callAll, assert, noop} from 'destam/util.js';

const watch = (obs, cb) => {
	if (isInstance(obs, Observer)) {
		const listener = shallowListener(obs, () => cb(obs.get()));
		cb(obs.get());
		return listener;
	}

	cb(obs);
	return noop;
};

const assignFirst = (remove, first) => {
	remove.first_ = first;
	return remove;
};

const arrayElement = (createMount, each) => (elem, _, before, notifyMount) => {
	const linkGetter = Symbol();
	let arrayListener;

	const root = {first_: before};
	root.next_ = root.prev_ = root;
	const addMount = (old, item, next) => {
		let mounted = old?.get(item)?.pop();
		if (mounted === next) return mounted;

		if (!mounted) {
			mounted = createMount(
				elem, item,
				() => (mounted?.next_ || next).first_(),
				notifyMount
			);
			mounted.item_ = item;
		} else {
			let mountAt, term;
			if (elem && (mountAt = next.first_()) !== (term = mounted.next_.first_())) {
				const a = document.activeElement;

				for (let cur = mounted.first_(); cur != term;) {
					const n = cur.nextSibling;
					elem.insertBefore(cur, mountAt);
					cur = n;
				}

				if (a) a.focus();
			}

			mounted.prev_.next_ = mounted.next_;
			mounted.next_.prev_ = mounted.prev_;
		}

		mounted.prev_ = next.prev_;
		mounted.next_ = next;
		mounted.prev_.next_ = next.prev_ = mounted;
		return mounted;
	};

	const insertMap = (map, item) => {
		let a = map.get(item.item_);
		if (!a) map.set(item.item_, a = []);
		push(a, item);
	};

	const cleanup = mounts => {
		for (const arr of mounts.values()) {
			for (const mount of arr) {
				mount.prev_.next_ = mount.next_;
				mount.next_.prev_ = mount.prev_;
				mount();
			}
		}
	};

	let link = null;
	const destroy = orphaned => {
		for (link = link?.linkNext_; link?.reg_; link = link.linkNext_) {
			delete link[linkGetter];
		}

		for (let cur = root.prev_; cur !== root; cur = cur.prev_) {
			(orphaned ? insertMap : cur)(orphaned, cur);
		}
	};

	const watcher = watch(each, each => {
		const observer = each[observerGetter];

		arrayListener?.();
		arrayListener = observer && shallowListener(observer, commit => {
			const orphaned = new Map();
			const inserts = [];

			for (const delta of commit) {
				const isModify = isInstance(delta, Modify);
				const link = delta.network_.link_;

				if (isModify || isInstance(delta, Delete)) {
					insertMap(orphaned, link[linkGetter]);
					delete link[linkGetter];
				}

				if (isModify || isInstance(delta, Insert)) {
					link.dom_val_ = delta.value;
					const next = link.linkNext_;

					if (next[linkGetter] || !next.reg_) {
						inserts.push(link);
					}
				}
			}

			for (let link of inserts) {
				let next = link.linkNext_[linkGetter] || root;
				for (; link.reg_ && !link[linkGetter]; link = link.linkPrev_) {
					next = link[linkGetter] = addMount(orphaned, link.dom_val_, next);
					delete link.dom_val_;
				}
			}

			cleanup(orphaned);
		});

		const orphaned = new Map();
		destroy(orphaned);

		link = observer?.linkNext_;
		let mounted = root;
		for (const item of each) {
			mounted = addMount(orphaned, item, mounted.next_);
			if (link) {
				link[linkGetter] = mounted;
				link = link.linkNext_;
			}
		}

		cleanup(orphaned);
	});

	notifyMount = 0;

	return assignFirst(() => {
		watcher();
		arrayListener?.();
		destroy();
	}, () => root.next_.first_());
};

const nativeElement = (e, props) => {
	const signals = [];
	let children = null, onmount = null, onunmount = null;

	const addSignal = (name, val) => {
		assert(typeof name === 'string', "Property list must have key as a string");

		if (name === 'children') {
			children = arrayElement(mount, val);
		} else if (name[0] === '$') {
			name = name.substring(1);

			const set = (obj, name, val) => {
				if (isInstance(val, Observer)) {
					push(signals, [val, val => {
						obj[name] = val ?? null;
					}]);
				} else {
					obj[name] = val ?? null;
				}
			};

			if (name == 'onmount') {
				onmount = val;
			} else if (name === 'onunmount') {
				onunmount = val;
			} else if (!isInstance(val, Observer) && typeof val === 'object') {
				for (const prop in val) {
					set(e[name], prop, val[prop]);
				}
			} else {
				set(e, name, val);
			}
		} else {
			const set = val => {
				val = val ?? false;
				assert(['boolean', 'string', 'number'].includes(typeof val), `type ${typeof val} is used as the attribute: ${name}`);

				if (typeof val === 'boolean') {
					e.toggleAttribute(name, val);
				} else {
					e.setAttribute(name, val);
				}
			};

			if (isInstance(val, Observer)) {
				push(signals, [val, set]);
			} else {
				set(val);
			}
		}
	};

	for (let o in props) {
		addSignal(o, props[o]);
	}

	return (parent, _, before, notifyMount) => {
		if (onmount) push(notifyMount, onmount);

		const remove = signals.map(([val, handler]) => watch(val, handler));
		const m = children?.(e, 0, noop, notifyMount);

		parent?.insertBefore(e, before());

		return assignFirst(() => {
			parent?.removeChild(e);
			callAll(remove);
			if (m) m();
			if (onunmount) callAllSafe([onunmount]);
		}, () => e);
	};
};

const callAllSafe = list => {
	for (const c of list) {
		try {
			c();
		} catch (e) {
			console.error(e);
		}
	}
};

export const mount = (elem, item, before, notifyMount) => {
	let mounted = null;
	let prevText = 0;
	const watcher = watch(item, val => {
		assert(val !== undefined, "Cannot mount undefined");

		if (val == null) {
			val = [];
		}

		let func;
		const type = typeof val;
		if (type === 'function') {
			prevText = 0;
			func = val;
		} else if (isInstance(val, Node)) {
			prevText = 0;
			func = nativeElement(val);
		} else if (type === 'object') {
			prevText = 0;
			func = arrayElement(mount, val);
		} else if (prevText) {
			prevText.textContent = val;
		} else {
			func = nativeElement(prevText = document.createTextNode(val));
		}

		if (func) {
			let notify;

			mounted?.();
			mounted = func(
				elem, val, before || noop,
				notifyMount || (notify = [])
			);

			if (notify) callAllSafe(notify);
		}
	});

	notifyMount = 0;

	return assignFirst(() => {
		watcher();
		mounted?.();
		mounted = null;
	}, () => (mounted?.first_ || before || noop)());
};

const functionElement = (func, props) => {
	const each = props.each;
	const createMount = (elem, item, before, notifyMount) => {
		const cleanup = [];
		let dom = null;
		try {
			if (each) props.each = item;
			dom = func(props, cb => {
				assert(typeof cb === 'function', "The cleanup function must be passed a function");
				push(cleanup, cb);
			});
		} catch (e) {
			console.error(e);
		}

		const m = mount(
			elem,
			dom,
			before,
			notifyMount,
		);

		return assignFirst(() => {
			m();
			callAllSafe(cleanup);
		}, m.first_);
	};

	if (!each) {
		return createMount;
	}

	assert(isInstance(each, Observer) || typeof each[Symbol.iterator] === 'function',
		"'each' property is not iterable");

	return arrayElement(createMount, each);
};

export const h = (name, props = {}, children) => {
	assert(name != null, "Tag name cannot be null or undefined");

	if (children) {
		props.children = children;
	}

	const type = typeof name;

	if (type == 'function') {
		return functionElement(name, props);
	} else {
		if (type == 'string') {
			name = document.createElement(name);
		}

		assert(isInstance(name, Node), "Unsupported node type: " + type);
		return nativeElement(name, props);
	}
};
