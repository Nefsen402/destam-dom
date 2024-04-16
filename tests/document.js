global.Node = class Node {
	constructor (name) {
		this.name = name;
		this.children = [];
		this.attributes = {};
		this.style = {};
	}

	set textContent (content) {
		if (this.name === '') {
			this.textContent_ = String(content);
		} else if (content === '') {
			this.children.length === 0;
		} else {
			throw new Error("not supported");
		}
	}

	get textContent () {
		if (this.name === '') {
			return this.textContent_;
		}

		throw new Error("not supported");
	}

	append (node) {
		node.parentElement = this;
		this.children.push(node);
	}

	prepend (node) {
		node.parentElement = this;
		this.children.unshift(node);
	}

	insertBefore (node, before) {
		if (!before) {
			this.append(node);
			return;
		}

		node.parentElement = this;

		const i = this.children.indexOf(before);
		if (i === -1) throw new Error("node not found");
		this.children.splice(i, 0, node);
	}

	replaceChild (node, before) {
		const i = this.children.indexOf(before);
		if (i === -1) throw new Error("node not found");

		node.parentElement = this;
		before.parentElement = null;
		this.children[i] = node;
	}

	removeChild (child) {
		const i = this.children.indexOf(child);
		if (i === -1) throw new Error("node not found");
		child.parentElement = null;
		this.children.splice(i, 1);
	}

	remove () {
		if (this.parentElement) {
			this.parentElement.removeChild(this);
		}
	}

	replaceWith (node) {
		if (this.parentElement) throw new Error("does not belong to a parent");
		this.parentElement.replaceChild(this, node);
	}

	setAttribute (name, val) {
		this.attributes[name] = String(val);
	}

	toggleAttribute (name, val) {
		if (!val) {
			delete this.attributes[name];
		} else {
			this.attributes[name] = '';
		}
	}

	tree () {
		if (this.name === '') {
			return this.textContent_;
		}

		const ret = {...this};
		delete ret.parentElement;

		if (this.children.length) {
			ret.children = this.children.map(child => child.tree());
		} else {
			delete ret.children;
		}

		if (!Object.keys(this.attributes).length) {
			delete ret.attributes;
		}

		if (!Object.keys(this.style).length) {
			delete ret.style;
		}

		return ret;
	}
};

global.document = {
	createElement: name => new Node(name),
	createTextNode: text => {
		const node = new Node('');
		node.textContent = text;
		return node;
	},
};
