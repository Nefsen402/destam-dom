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

const simpleMount = (parent, e, before, _, watching) => {
	parent?.insertBefore(e, before());

	return {
		remove_: () => {
			parent?.removeChild(e);
			if (watching) callAll(watching);
		},
		first_: () => e,
	};
};

export const mount = (elem, list, before, notifyMount) => {
	const term = {mount_: {first_: before || noop}};
	let first, prev;
	const add = obj => {
		if (!first) first = obj;
		if (prev) prev.next_ = obj;
		prev = obj;
	};

	const iter = item => {
		if (isInstance(item, Array)) {
			item.forEach(iter);
			return;
		}

		let prevText = 0;
		const obj = {next_: term};
		add(obj);
		obj.remove_ = watch(item, val => {
			assert(val !== undefined, "Cannot mount undefined");

			if (val == null) {
				val = [];
			}

			let func;
			if (typeof val === 'function') {
				prevText = 0;
				func = val;
			} else if (isInstance(val, Node)) {
				prevText = 0;
				func = simpleMount;
			} else if (isInstance(val, Array)) {
				prevText = 0;
				func = mount;
			} else if (prevText) {
				prevText.textContent = val;
			} else {
				val = prevText = document.createTextNode(val);
				func = simpleMount;
			}

			if (func) {
				let notify;

				obj.mount_?.remove_();
				obj.mount_ = func(elem, val, () => obj.next_.mount_.first_(), notifyMount || (notify = []));

				if (notify) callAll(notify);
			}
		});
	};

	iter(list);
	add(term);
	notifyMount = 0;

	const remove = () => {
		for (let l = first; l.next_; l = l.next_) {
			l.mount_.remove_();
			l.remove_();
		}
		first = term;
	};

	return {
		remove: remove,
		remove_: remove,
		first_: () => first.mount_.first_(),
	};
};

const nativeElement = (e, props) => {
	const mountListeners = [];
	const signals = [];
	let children = null;

	props.forEach(([name, val]) => {
		assert(typeof name === 'string', "Property list must have key as a string");

		if (name === 'children') {
			children = val;
			return;
		}

		if (name[0] === '$') {
			name = name.substring(1);

			if (isInstance(val, Observer)) {
				push(signals, [val, val => {
					e[name] = val;
				}]);
			} else {
				e[name] = val;
			}

			return;
		}

		const setAttribute = val => {
			if (val == null) {
				val = false;
			}

			if (typeof val === 'boolean') {
				e.toggleAttribute(name, val);
			} else {
				e.setAttribute(name, val);
			}
		};

		if (isInstance(val, Observer)) {
			push(signals, [val, setAttribute]);
			return;
		}

		const type = typeof val;
		if (type === 'object') {
			for (const prop in val) {
				const attr = val[prop];
				const set = (prop => val => {
					if (val == null) {
						e[name].removeProperty(prop);
					} else {
						e[name].setProperty(prop, val);
					}
				})(prop);

				if (isInstance(attr, Observer)) {
					push(signals, [attr, set]);
				} else {
					set(attr);
				}
			}

			return;
		}

		if (type === 'function') {
			if (name == 'mount') {
				push(mountListeners, val);
			} else {
				e.addEventListener(name, val);
			}

			return;
		}

		setAttribute(val);
	});

	return (parent, _, before, notifyMount) => {
		notifyMount.push(...mountListeners);

		const remove = signals.map(([val, handler]) => watch(val, handler));
		if (children != null) {
			push(remove, mount(e, children, 0, notifyMount).remove_);
		}

		return simpleMount(parent, e, before, 0, remove);
	};
};

const functionElement = (func, props) => {
	assert((() => {
		const seen = new Set(), dups = new Set();
		for (const [name] of props) {
			if (seen.has(name)) {
				dups.add(name);
			}

			seen.add(name);
		}

		return !dups.size;
	})(), "Duplicate tags");

	const createMount = (elem, _, before, notifyMount) => {
		const cleanup = [];
		let dom = null;
		try {
			dom = func(Object.fromEntries(props), cb => {
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

		return {
			remove_: () => {
				m.remove_();

				for (const c of cleanup) {
					try {
						c();
					} catch (e) {
						console.error(e);
					}
				}
			},
			first_: m.first_,
		};
	};

	const eachEntry = props.find(e => e[0] === 'each');
	if (!eachEntry) {
		return createMount;
	}

	const each = eachEntry[1];
	assert(isInstance(each, Observer) || typeof each[Symbol.iterator] === 'function',
		"'each' property is not iterable");

	return (elem, _, before, notifyMount) => {
		const linkGetter = Symbol();
		let mounts;
		let arrayListener;

		const root = {first_: before};
		root.next_ = root.prev_ = root;

		const cleanup = (mounts) => {
			for (const arr of mounts.values()) {
				for (const mount of arr) {
					mount.prev_.next_ = mount.next_;
					mount.next_.prev_ = mount.prev_;

					mount.remove_();
					if (mount.link_) delete mount.link_[linkGetter];
				}
			}
		};

		const insertMap = (map, item, prop) => {
			let a = map.get(item);
			if (!a) map.set(item, a = []);
			push(a, prop);
		};

		const addMount = (old, item, next) => {
			let mounted = old?.get(item)?.shift();

			if (!mounted) {
				eachEntry[1] = item;

				mounted = createMount(
					elem, 0,
					() => (mounted?.next_ || next).first_(),
					notifyMount
				);
			} else if (elem && next !== mounted) {
				const a = document.activeElement;

				const mountAt = next.first_();
				const term = mounted.next_.first_();
				for (let cur = mounted.first_(); cur != term;) {
					const n = cur.nextSibling;
					elem.insertBefore(cur, mountAt);
					cur = n;
				}

				if (a) a.focus();
				mounted.prev_.next_ = mounted.next_;
				mounted.next_.prev_ = mounted.prev_;
			} else {
				insertMap(mounts, item, mounted);
				return mounted;
			}

			mounted.prev_ = next.prev_;
			mounted.next_ = next;
			mounted.prev_.next_ = next.prev_ = mounted;
			insertMap(mounts, item, mounted);
			return mounted;
		};

		const listener = watch(each, each => {
			arrayListener?.();
			const observer = each[observerGetter];

			arrayListener = observer && shallowListener(observer, commit => {
				const orphaned = new Map();
				const inserts = [];

				for (const delta of commit) {
					const isModify = isInstance(delta, Modify);
					const link = delta.network_.link_;

					if (isModify || isInstance(delta, Delete)) {
						insertMap(orphaned, delta.prev, link[linkGetter]);
						link[linkGetter] = null;
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

			const oldMounts = mounts;
			mounts = new Map();

			let link = observer?.linkNext_;
			let mounted = root;
			for (const item of each) {
				mounted = addMount(oldMounts, item, mounted.next_);
				if (link) {
					link[linkGetter] = mounted;
					link = link.linkNext_;
				}
			}
			if (oldMounts) cleanup(oldMounts);
		});

		notifyMount = 0;

		return {
			remove_: () => {
				listener();
				cleanup(mounts);
				arrayListener?.();
			},
			first_: () => root.next_.first_(),
		};
	}
};

export const h = (name, props = [], children) => {
	assert(name != null, "Tag name cannot be null or undefined");

	if (children) {
		push(props, ['children', children]);
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
