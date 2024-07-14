import Observer, {shallowListener} from 'destam/Observer.js';
import {isInstance, noop} from 'destam/util.js';
export { mount, getFirst } from './dom.js';

export const createElement = (elem, ns) => {
	if (ns) {
		return document.createElementNS(ns, elem);
	} else {
		return document.createElement(elem);
	}
};

export const createTextNode = text => document.createTextNode(text);

export const watch = (obs, cb) => {
	if (isInstance(obs, Observer)) {
		const l = shallowListener(obs, () => cb(obs()));
		obs = obs.get;
		cb(obs());
		return l;
	} else {
		cb(obs);
		return noop;
	}
};

export const setAttribute = (e, name, val) => {
	val = val ?? false;
	if (typeof val === 'boolean') {
		e.toggleAttribute(name, val);
	} else {
		e.setAttribute(name, val);
	}
};
