import Observer, {shallowListener} from 'destam/Observer.js';
import {isInstance} from 'destam/util.js';
export { mount } from './dom.js';

export const watch = (cleanup, obs, cb) => {
	if (isInstance(obs, Observer)) {
		cleanup(shallowListener(obs, () => cb(obs.get())));
		cb(obs.get());
	} else {
		cb(obs);
	}
};
