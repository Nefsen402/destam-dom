import parser from '@babel/parser';
import t from '@babel/types';
import generate from '@babel/generator';
import babelTraverse from '@babel/traverse';

const canAppend = Symbol();
const walked = Symbol();

const createTemporary = i => t.identifier('static_' + i + '_' + Math.random().toString().substring(2));
const declare = (ident, val) => t.variableDeclaration('const', [t.variableDeclarator(ident, val)]);
const createElement = name => {
	const elem = t.callExpression(t.memberExpression(t.identifier("document"), t.identifier("createElement")), [name]);
	elem[canAppend] = true;
	return elem;
};

const computeNode = (rep, refs, node) => {
	if (node[walked]) return node;
	const [name, props, ...children] = node.arguments;
	const isRef = name.type === 'Identifier' && refs.includes(name.name);

	node[walked] = true;

	if (name.type !== 'StringLiteral' && !isRef) {
		return node;
	}

	if (props && props.type !== 'ObjectExpression') {
		return node;
	}

	let temporary = null;
	const getTemp = () => {
		if (temporary) return temporary;

		if (isRef) {
			temporary = name;
		} else {
			temporary = createTemporary(rep.length);
			rep.push(declare(temporary, createElement(name)));
		}

		temporary[canAppend] = true;
		return temporary;
	};

	if (props) for (let i = 0; i < props.properties.length; i++) {
		const prop = props.properties[i];
		if (prop.type !== 'ObjectProperty') break;

		let key = prop.key;
		const isRawSetter = (key.name || key.value).charAt(0) === '$';
		if (isRawSetter) {
			if (key.type === "Identifier") {
				key = t.identifier(key.name.substring(1));
			} else if (key.type === 'StringLiteral') {
				key = t.stringLiteral(key.value.substring(1));
			}
		}

		const search = (name, val, getTemp) => {
			const binaryType = val.type === 'BinaryExpression' &&
				([
					'+', '-', '==', '===', '!=',
					'!==', 'in', 'instanceof',
					'>', '<', "<=", ">="
				].includes(val.operator) ? 'bool' : 'other');

			const isJoinPattern = val.type === 'CallExpression' &&
				val.callee.type === 'MemberExpression' &&
				val.callee.property.type === 'Identifier' &&
				val.callee.property.name === 'join' &&
				val.callee.object.type === 'ArrayExpression';

			if (val.type === 'ObjectExpression') {
				for (let ii = 0; ii < val.properties.length; ii++) {
					const objectProp = val.properties[ii];
					if (objectProp.type !== 'ObjectProperty') break;

					if (search(objectProp.key, objectProp.value,
							() => t.memberExpression(getTemp(), name, name.type === 'StringLiteral'))) {
						val.properties.splice(ii--, 1);
					}
				}

				if (val.properties.length === 0) {
					return true;
				}
			} else if (isRawSetter) {
				if (isJoinPattern || [
					'BooleanLiteral', 'StringLiteral',
					'NumericLiteral', 'ArrowFunctionExpression',
					'FunctionExpression', 'BinaryExpression',
					'TemplateLiteral', 'UpdateExpression',
				].includes(val.type)) {
					rep.push(t.expressionStatement(t.assignmentExpression('=',
						t.memberExpression(getTemp(), name, name.type === 'StringLiteral'),
						val
					)));

					return true;
				}
			} else if (binaryType === 'bool' || val.type === 'BooleanLiteral') {
				rep.push(t.expressionStatement(t.callExpression(
					t.memberExpression(getTemp(), t.identifier('toggleAttribute')),
					[name.type === 'Identifier' ? t.stringLiteral(name.name) : name, val]
				)));

				return true;
			} else if (binaryType === 'other' || isJoinPattern || [
				'StringLiteral', 'NumericLiteral',
				'TemplateLiteral', 'UpdateExpression',
			].includes(val.type)) {
				rep.push(t.expressionStatement(t.callExpression(
					t.memberExpression(getTemp(), t.identifier('setAttribute')),
					[name.type === 'Identifier' ? t.stringLiteral(name.name) : name, val]
				)));

				return true;
			}

			return false;
		};

		if (search(key, prop.value, getTemp)) {
			props.properties.splice(i--, 1);
		}
	}

	const links = [];
	for (let i = 0; i < children.length; i++) {
		let child = children[i];

		let append = false;
		if (['StringLiteral', 'BooleanLiteral', 'NumericLiteral'].includes(child.type)) {
			let temporary = createTemporary(rep.length);
			rep.push(declare(temporary, t.callExpression(
				t.memberExpression(t.identifier("document"), t.identifier("createTextNode")),
				[child]
			)));

			child = temporary;
			append = true;
		} else if (child.type === 'CallExpression' &&
				child.callee.type === 'Identifier' && child.callee.name === 'h') {
			child = computeNode(rep, refs, child);

			if (child[canAppend]) {
				append = true;
			}
		}

		if (append) {
			links.push(child);
			rep.push(t.expressionStatement(t.callExpression(
				t.memberExpression(getTemp(), t.identifier('append')),
				[child]
			)));
		}

		if (!child) {
			children.splice(i--, 1);
		} else {
			children[i] = child;
		}
	}

	for (let i = 0; i < children.length; i++) {
		if (links.includes(children[i])) {
			children.splice(i--, 1);
		} else {
			while (++i < children.length && !links.includes(children[i]));
		}
	}

	if (children.length === 0 && (!props || props.properties.length === 0)) {
		return temporary || createElement(name);
	} else {
		const node = t.callExpression(t.identifier('h'), [temporary || name, props, ...children]);
		node[walked] = true;
		return node;
	}
}

const transformBabelAST = (ast) => {
	babelTraverse.default(ast, {
		CallExpression: path => {
			if (path.node[walked]) return;
			if (path.node.callee.type !== 'Identifier' || path.node.callee.name !== 'h') return;


			let block = path;
			let index;
			while (!block.node.body) {
				if (block.parentPath.node.body) {
					if (!Array.isArray(block.parentPath.node.body)) {
						block.replaceWith(t.blockStatement([t.returnStatement(block.node)]));
						return;
					} else {
						index = block.parentPath.node.body.indexOf(block.node);
					}
				}

				block = block.parentPath;
			}

			const refs = [];

			// look for ref definitions
			for (const b of block.node.body) {
				if (b.type === 'VariableDeclaration' && b.kind === 'const') {
					for (let decl of b.declarations) {
						if (decl.type === 'VariableDeclarator' &&
								decl.init && decl.init.type === 'CallExpression' &&
								decl.init.callee.type === 'MemberExpression' &&
								decl.init.callee.object.type === 'Identifier' &&
								decl.init.callee.object.name === 'document')  {
							refs.push(decl.id.name)
						}
					}
				}
			}

			const rep = [];
			const ret = computeNode(rep, refs, path.node);
			if (ret !== path.node || rep.length > 0) {
				path.replaceWith(ret);
			}

			block.node.body.splice(index, 0, ...rep);
		}
	});
};

const transform = (source, options) => {
	const ast = parser.parse(source, {sourceType: 'module', ...options, code: false, ast: true});

	transformBabelAST(ast);

	return generate.default(ast, {
		sourceMaps: true,
		...options,
	}, source);
};

console.log(transform(`
	let $thing = 0;
	const Button = ({ id, text, fn }) =>
	  mount(h('div', {"class": 'col-sm-6 smallpad'},
	    h('button', {id, "class": 'btn btn-primary btn-block', type: 'button', $onclick: fn}, text)
	  ))

	let a = () => h('a', {hello: world < 0, thing: value * 2});

	const div = document.createElement('div');

	mount(h(div, {hello: 'world', $value: 10, num: 10.5, bool: true, $style: {
		"hello with a space": "world",
		func: (a) => lol,
		func2: function () {},
		class: ["hello"].join('')
	}}, "hello", 0, h('br'), h('br')));

	h('div', {}, h('div'), stuff)
`).code);


export default transform;
