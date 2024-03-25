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

const nodeMounter = (elem, e, before, _, __, remove) => {
	if (!isInstance(e, Node)) {
		e = document.createTextNode(e);
	}

	elem?.insertBefore(e, before());

	return assignFirst(val => {
		if (val == null) {
			elem?.removeChild(e);
			if (remove) callAll(remove);
			return 0;
		}

		if (isInstance(val, Node)) {
			elem?.replaceChild(val, e);
			e = val;
		} else {
			e.textContent = val;
		}

		return 1;
	}, () => e);
};

let notifyMount;
const callAllSafe = list => {
	if (list === notifyMount) notifyMount = null;
	if (list) for (const c of list) {
		try {
			c();
		} catch (e) {
			console.error(e);
		}
	}
};

const insertMap = (map, item) => {
	let a = map.get(item.item_);
	if (!a) map.set(item.item_, a = []);
	push(a, item);
};

const cleanupArrayMounts = mounts => {
	for (const arr of mounts.values()) {
		for (const mount of arr) {
			mount.prev_.next_ = mount.next_;
			mount.next_.prev_ = mount.prev_;
			mount();
		}
	}
};

const destroyArrayMounts = (link, root, linkGetter, orphaned) => {
	for (link = link?.linkNext_; link?.reg_; link = link.linkNext_) {
		delete link[linkGetter];
	}

	for (let cur = root.prev_; cur !== root; cur = cur.prev_) {
		(orphaned ? insertMap : cur)(orphaned, cur);
	}
};

const arrayMounter = (elem, val, before, mounter) => {
	const root = {first_: before};
	root.next_ = root.prev_ = root;
	const addMount = (old, item, next) => {
		let mounted = old?.get(item)?.pop();
		if (mounted === next) return mounted;

		if (!mounted) {
			let not;
			if (!notifyMount) {
				not = notifyMount = [];
			}

			mounted = mounter(
				elem, item,
				() => (mounted?.next_ || next).first_(),
			);

			callAllSafe(not);
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

	const linkGetter = Symbol();
	let link, arrayListener;
	const mountList = (val, orphaned) => {
		const observer = val[observerGetter];

		link = observer?.linkNext_;
		let mounted = root;
		for (const item of val) {
			mounted = addMount(orphaned, item, mounted.next_);
			if (link) {
				link[linkGetter] = mounted;
				link = link.linkNext_;
			}
		}

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

			cleanupArrayMounts(orphaned);
		});
	};

	mountList(val);

	return assignFirst(val => {
		if (val) {
			const orphaned = new Map();
			destroyArrayMounts(link, root, linkGetter, orphaned);
			mountList(val, orphaned);
			cleanupArrayMounts(orphaned);

			return 1;
		}

		arrayListener?.();
		destroyArrayMounts(link, root, linkGetter);
		return 0;
	}, () => root.next_.first_());
};


export const mount = (elem, item, before = noop, mounter = mount) => {
	let mounted = null;
	let lastFunc;
	const watcher = watch(item, val => {
		assert(val !== undefined, "Cannot mount undefined");

		let type = typeof val;
		let func;
		if (val == null || type === 'function') {
			func = val;
		} else if (isInstance(val, Node) || type !== 'object') {
			func = nodeMounter;
		} else {
			func = arrayMounter;
		}

		let not;
		if (!notifyMount) {
			not = notifyMount = [];
		}

		if (!mounted?.(lastFunc === func ? val : null)) {
			mounted = func?.(elem, val, before, mounter);
		}

		callAllSafe(not);
		lastFunc = func;
	});

	return assignFirst(() => {
		watcher();
		mounted?.();
		mounted = null;
	}, () => (mounted?.first_ || before)());
};

export const h = (e, props = {}, children) => {
	assert(e != null, "Tag name cannot be null or undefined");

	if (children != null) {
		props.children = children;
	}

	if (typeof e === 'function') {
		const each = props.each;
		const createMount = (elem, item, before) => {
			let dom = null, cleanup = 0;

			try {
				if (each) props.each = item;

				dom = e(props, cb => {
					assert(typeof cb === 'function', "The cleanup function must be passed a function");
					push(cleanup || (cleanup = []), cb);
				}, cb => {
					assert(typeof cb === 'function', "The mount function must be passed a function");
					push(notifyMount, cb);
				});
			} catch (e) {
				console.error(e);
			}

			const m = mount(
				elem,
				dom,
				before,
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

		return (elem, item, before) =>
			mount(elem, each, before, createMount);
	} else {
		assert(isInstance(e, Node) || typeof e === 'string',
			"Unsupported node type: " + typeof e);

		if (!isInstance(e, Node)) {
			e = document.createElement(e);
		}

		children = props.children;
		delete props.children;

		const signals = [];
		Object.entries(props).map(([name, val]) => {
			assert(typeof name === 'string', "Property list must have key as a string");

			if (name[0] === '$') {
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

				if (!isInstance(val, Observer) && typeof val === 'object') {
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
		});

		return (elem, _, before) => {
			const remove = signals.map(([val, handler]) => watch(val, handler));
			if (children != null) push(remove, mount(e, children, noop));

			return nodeMounter(elem, e, before, 0, remove);
		};
	}
};
