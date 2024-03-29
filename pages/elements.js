import {mount, Observer} from '/index.js';

let elements = ['one', 'two', 'three'].map(name => document.createTextNode(name));

mount(document.body, Observer.timer(500).map(i => elements[i % elements.length]));
