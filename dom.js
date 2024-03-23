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

const callAllSafe = list => {
	for (const c of list) {
		try {
			c();
		} catch (e) {
			console.error(e);
		}
	}
};

export const mount = (elem, item, before = noop, notifyMount, mounter = mount) => {
	let mounted = null;
	let lastType = 0;
	const watcher = watch(item, val => {
		assert(val !== undefined, "Cannot mount undefined");

		let func;
		let type = typeof val;
		if (val == null) {
			func = val;
			type = 1;
		} else if (type === 'function') {
			func = val;
			type = 2;
		} else if (isInstance(val, Node) || type !== 'object') {
			func = (elem, e, before) => {
				if (!isInstance(e, Node)) {
					e = document.createTextNode(e);
				}

				elem?.insertBefore(e, before());

				return assignFirst(val => {
					if (isInstance(val, Node)) {
						elem?.replaceChild(val, e);
						e = val;
						return 1;
					} else if (val != null) {
						e.textContent = val;
						return 1;
					}

					elem?.removeChild(e);
				}, () => e);
			};

			type = 3;
		} else {
			func = (elem, val, before, notifyMount) => {
				const linkGetter = Symbol();
				let arrayListener;

				const root = {first_: before};
				root.next_ = root.prev_ = root;
				const addMount = (old, item, next) => {
					let mounted = old?.get(item)?.pop();
					if (mounted === next) return mounted;

					if (!mounted) {
						mounted = mounter(
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

						cleanup(orphaned);
					});
				};

				mountList(val);
				notifyMount = 0;

				return assignFirst(val => {
					if (val) {
						const orphaned = new Map();
						destroy(orphaned);
						mountList(val, orphaned);
						cleanup(orphaned);

						return 1;
					}

					arrayListener?.();
					destroy();
				}, () => root.next_.first_());
			};

			type = 4;
		}

		let notify;

		if (!mounted?.(lastType === type ? val : null)) mounted = func?.(
			elem, val, before,
			notifyMount || (notify = [])
		);

		if (notify) callAllSafe(notify);
		lastType = type;
	});

	notifyMount = 0;

	return assignFirst(() => {
		watcher();
		mounted?.();
		mounted = null;
	}, () => (mounted?.first_ || before)());
};

export const h = (e, props = {}, children) => {
	assert(e != null, "Tag name cannot be null or undefined");

	if (children) {
		props.children = children;
	}

	if (typeof e === 'function') {
		const each = props.each;
		const createMount = (elem, item, before, notifyMount) => {
			const cleanup = [];
			let dom = null;
			try {
				if (each) props.each = item;
				dom = e(props, cb => {
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

		return (elem, item, before, notifyMount) =>
			mount(elem, each, before, notifyMount, createMount);
	} else {
		assert(isInstance(e, Node) || typeof e === 'string',
			"Unsupported node type: " + typeof e);

		const signals = [];
		let children = null, onmount = null, onunmount = null;

		const addSignal = (name, val) => {
			assert(typeof name === 'string', "Property list must have key as a string");

			if (name === 'children') {
				children = val;
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

		if (!isInstance(e, Node)) {
			e = document.createElement(e);
		}

		for (let o in props) {
			addSignal(o, props[o]);
		}

		return (elem, _, before, notifyMount) => {
			if (onmount) push(notifyMount, onmount);

			const remove = signals.map(([val, handler]) => watch(val, handler));
			const m = children != null && mount(e, children, noop, notifyMount);

			elem?.insertBefore(e, before());
			return assignFirst(() => {
				elem?.removeChild(e);
				callAll(remove);
				if (m) m();
				if (onunmount) callAllSafe([onunmount]);
			}, () => e);
		};
	}
};
