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

const simpleMount = e => (parent, before, watching) => {
	parent?.insertBefore(e, before());

	return {
		remove_: () => {
			parent?.removeChild(e);
			if (watching) callAll(watching);
		},
		move_: to => {
			const a = document.activeElement;
			let focus = 0;
			let current = a;
			while (current) {
				if (current == e) {
					focus = 1;
					current = 0;
				} else {
					current = current.parentNode;
				}
			}
			to(e);
			if (focus) a.focus();
		},
		first_: () => e,
	};
};

export const mount = (elem, list, cleanup, before, notifyMount) => {
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

			let func;
			if (typeof val == 'function') {
				prevText = 0;
				func = val;
			} else if (isInstance(val, Node)) {
				prevText = 0;
				func = simpleMount(val);
			} else if (val == null) {
				prevText = 0;
				func = (elem, before, notify) => mount(elem, [], 0, before, notify);
			} else if (isInstance(val, Array)) {
				prevText = 0;
				func = (elem, before, notify) => mount(elem, val, 0, before, notify);
			} else if (prevText) {
				prevText.textContent = val;
			} else {
				func = simpleMount(prevText = document.createTextNode(val));
			}

			if (func) {
				let notifyMaster = 0;
				if (!notifyMount) {
					notifyMount = [];
					notifyMaster = 1;
				}

				obj.mount_?.remove_();
				obj.mount_ = func(elem, () => obj.next_.mount_.first_(), notifyMount);

				if (notifyMaster) {
					callAll(notifyMount);
					notifyMount = 0;
				}
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
		if (cleanup) for (const c of cleanup) {
			try {
				c();
			} catch (e) {
				console.log(e.stack);
			}
		}
	};

	return {
		remove: remove,
		remove_: remove,
		move_: to => {
			for (let l = first; l.next_; l = l.next_) {
				l.mount_.move_(to);
			}
		},
		first_: () => first.mount_.first_(),
	};
};

const nativeElement = (e, props) => {
	const elementMount = simpleMount(e);
	return (parent, before, notifyMount) => {
		const mounted = elementMount(parent, before, props.map(([name, val]) => {
			let currentKey = noop;
			const remove = watch(val, val => {
				currentKey();
				currentKey = noop;

				if (val == null) {
					e.removeAttribute(name);
				} else if (name == 'children') {
					currentKey = mount(e, val, 0, 0, notifyMount).remove_;
				} else if (name[0] === '$') {
					e[name.substring(1)] = val;
				} else {
					const type = typeof val;
					if (type === 'function') {
						if (name == 'mount') {
							push(notifyMount, val);
						} else {
							e.addEventListener(name, val);
							currentKey = () => e.removeEventListener(name, val);
						}
					} else if (type === 'object') {
						const listeners = Object.entries(val).map(([prop, val]) => {
							return watch(val, v => {
								if (v == null) {
									e[name].removeProperty(prop);
								} else {
									e[name].setProperty(prop, v);
								}
							});
						});

						currentKey = () => callAll(listeners);
					} else {
						if (type === 'boolean') {
							e.toggleAttribute(name, val);
						} else {
							e.setAttribute(name, val);
						}
					}
				}
			});

			return () => {
				remove();
				currentKey();
			};
		}));

		return mounted;
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

	assert((() => {
		for (const [name, val] of props) {
			if (name === 'each' && !isInstance(val, Observer) && val[Symbol.iterator] === 'function') {
				return false;
			}
		}

		return true;
	})(), "'each' property is not iterable");

	const createMount = (elem, before, notifyMount) => {
		const cleanup = [];
		let dom = null;
		try {
			dom = func(Object.fromEntries(props), cb => {
				assert(typeof cb === 'function', "The cleanup function must be passed a function");
				push(cleanup, cb);
			});
		} catch (e) {
			console.log(e.stack);
		}

		return mount(
			elem,
			dom,
			cleanup,
			before,
			notifyMount,
		);
	};

	const eachEntry = props.find(e => e[0] === 'each');
	if (!eachEntry) {
		return createMount;
	}

	const each = eachEntry[1];

	return (elem, before, notifyMount) => {
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
			let mounted = old?.get(item)?.pop();

			if (!mounted) {
				eachEntry[1] = item;

				mounted = createMount(
					elem,
					() => (mounted?.next_ || next).first_(),
					notifyMount
				);
			} else if (elem && next !== mounted) {
				mounted.prev_.next_ = mounted.next_;
				mounted.next_.prev_ = mounted.prev_;

				const mountAt = next.first_();
				mounted.move_(e => elem.insertBefore(e, mountAt));
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
			move_: to => {
				for (let current = root.next_; current !== root; current = current.next_) {
					current.move_(to);
				}
			},
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
