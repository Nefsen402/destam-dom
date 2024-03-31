import parser from '@babel/parser';
import t from '@babel/types';
import generate from '@babel/generator';
import babelTraverse from '@babel/traverse';

const createTemporary = i => t.identifier('static_' + i + '_' + Math.random().toString().substring(2));
const declare = (ident, val) => t.variableDeclaration('const', [t.variableDeclarator(ident, val)]);

const computeNode = (rep, node) => {
	const [name, props, ...children] = node.arguments;

	if (name.type !== 'StringLiteral') {
		return node;
	}

	if (props && props.type !== 'ObjectExpression') {
		return node;
	}

	let temporary = createTemporary(rep.length);
	rep.push(declare(temporary, t.callExpression(
		t.memberExpression(t.identifier("document"), t.identifier("createElement")),
		[name]
	)));

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

		const search = (name, val, e) => {
			let binaryType = val.type === 'BinaryExpression' &&
				([
					'+', '-', '==', '===', '!=',
					'!==', 'in', 'instanceof',
					'>', '<', "<=", ">="
				].includes(val.operator) ? 'bool' : 'other');

			if (val.type === 'ObjectExpression') {
				for (let ii = 0; ii < val.properties.length; ii++) {
					const objectProp = val.properties[ii];
					if (objectProp.type !== 'ObjectProperty') break;

					if (search(objectProp.key, objectProp.value, t.memberExpression(e, name, name.type === 'StringLiteral'))) {
						val.properties.splice(ii--, 1);
					}
				}

				if (val.properties.length === 0) {
					return true;
				}
			} else if (isRawSetter) {
				if ([
					'BooleanLiteral', 'StringLiteral',
					'NumericLiteral', 'ArrowFunctionExpression',
					'FunctionExpression', 'BinaryExpression',
					'TemplateLiteral', 'UpdateExpression',
				].includes(val.type)) {
					rep.push(t.expressionStatement(t.assignmentExpression('=',
						t.memberExpression(e, name, name.type === 'StringLiteral'),
						val
					)));

					return true;
				}
			} else if (binaryType === 'bool' || val.type === 'BooleanLiteral') {
				rep.push(t.expressionStatement(t.callExpression(
					t.memberExpression(e, t.identifier('toggleAttribute')),
					[name.type === 'Identifier' ? t.stringLiteral(name.name) : name, val]
				)));

				return true;
			} else if (binaryType === 'other' || [
				'StringLiteral', 'NumericLiteral',
				'TemplateLiteral', 'UpdateExpression',
			].includes(val.type)) {
				rep.push(t.expressionStatement(t.callExpression(
					t.memberExpression(e, t.identifier('setAttribute')),
					[name.type === 'Identifier' ? t.stringLiteral(name.name) : name, val]
				)));

				return true;
			}

			return false;
		};

		if (search(key, prop.value, temporary)) {
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
			child = computeNode(rep, child);

			if (child.type === 'Identifier') {
				append = true;
			}
		}

		if (append) {
			links.push(child);
			rep.push(t.expressionStatement(t.callExpression(
				t.memberExpression(temporary, t.identifier('append')),
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
		return temporary;
	}

	return t.callExpression(t.identifier('h'), [temporary, props, ...children]);
}

const transformBabelAST = (ast) => {
	babelTraverse.default(ast, {
		CallExpression: path => {
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

			const rep = [];
			const ret = computeNode(rep, path.node);
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

/*
console.log(transform(`
	let $thing = 0;
	const Button = ({ id, text, fn }) =>
	  mount(h('div', {"class": 'col-sm-6 smallpad'},
	    h('button', {id, "class": 'btn btn-primary btn-block', type: 'button', $onclick: fn}, text)
	  ))

	let a = () => h('a', {hello: world < 0, thing: value * 2});

	mount(h('div', {hello: 'world', $value: 10, num: 10.5, bool: true, $style: {
		"hello with a space": "world",
		func: (a) => lol,
		func2: function () {}
	}}, "hello", 0, h('br'), h('br')));
`).code);
*/

export default transform;
