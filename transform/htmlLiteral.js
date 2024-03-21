import parser from '@babel/parser';
import generate from '@babel/generator';
import babelTraverse from '@babel/traverse';
import t from '@babel/types';
import util from 'util';
import htm, {validTags} from '../htm.js';

const createArray = (items) => {
	if (items.length === 1) {
		return items[0];
	} else {
		return t.arrayExpression(items);
	}
};

const html = htm((name, props, children) => {
	if (typeof name === 'string') {
		name = t.stringLiteral(name);
	}

	if (props.length === 0 && !children) {
		return t.callExpression(t.identifier('h'), [name]);
	}

	const args = [
		name,
		t.arrayExpression(props.map(obj => {
			if (obj.type === 'SpreadElement') {
				return obj;
			}

			let [key, val] = obj;

			if (val === true) {
				val = t.booleanLiteral(val);
			}

			if (typeof key === 'string') {
				key = t.stringLiteral(key);
			}

			if (typeof val === 'string') {
				val = t.stringLiteral(val);
			}

			return t.arrayExpression([key, val]);
		})),
	]

	if (children) {
		args.push(t.arrayExpression(children.map(child => {
			if (typeof child === 'string') {
				return t.stringLiteral(child);
			} else {
				return child;
			}
		})));
	}

	return t.callExpression(t.identifier('h'), args);
}, obj => {
	return [t.spreadElement(t.callExpression(t.memberExpression(t.identifier("Object"), t.identifier("entries")), [obj]))];
}, strings => {
	if (strings.length === 1) {
		return strings[0];
	}

	return t.callExpression(
		t.memberExpression(t.callExpression(t.memberExpression(t.identifier("Observer"), t.identifier("all")), [
			t.arrayExpression(strings.map(string => {
				if (typeof string === 'string') {
					string = t.stringLiteral(string);
				}

				return t.callExpression(
					t.memberExpression(t.identifier("Observer"), t.identifier("immutable")),
					[string],
				);
			})),
		]), t.identifier('map')), [
		t.arrowFunctionExpression(
			[t.identifier('x')],
			t.callExpression(
				t.memberExpression(t.identifier('x'), t.identifier('join')),
				[t.stringLiteral("")]
			)
		),
	]);
});

const parse = node => {
	let name = node.openingElement.name;
	if (name.type === 'JSXIdentifier') {
		if (name.name[0].toLowerCase() !== name.name[0]) {
			name = t.identifier(name.name);
		} else {
			if (!validTags.includes(name.name.toUpperCase())) {
				throw new Error("Invalid tag name: " + name.name);
			}

			name = t.stringLiteral(name.name);
		}
	}

	const args = [
		name,
		t.arrayExpression(node.openingElement.attributes.map(attr => {
			if (attr.type === 'JSXSpreadAttribute') {
				return t.spreadElement(t.callExpression(
					t.memberExpression(t.identifier("Object"), t.identifier("entries")), [
						attr.argument,
					]
				));
			}

			let {name, value} = attr;
			if (!value) {
				value = t.booleanLiteral(true)
			} else if (value.type === 'JSXExpressionContainer') {
				value = value.expression;
			}

			if (name.type !== 'JSXIdentifier') {
				throw new Error("Attribute name must be an identifier");
			}

			return t.arrayExpression([t.stringLiteral(name.name), value]);
		})),
	];

	const children = transformChildren(node);

	if (children.length) {
		args.push(t.arrayExpression(children));
	}

	return t.callExpression(t.identifier('h'), args);
};

const transformChildren = node => {
	const children = [];
	let canExclude = false, newline = false, whitespace = false, cur = '';

	const flush = () => {
		if (whitespace) {
			if (!newline) cur += ' ';

			newline = false;
			whitespace = false;
		}

		if (cur) children.push(t.stringLiteral(cur));
		canExclude = true;
		cur = '';
	};

	for (const child of node.children) {
		if (child.type === 'JSXText') {
			for (let i = 0; i < child.value.length; i++) {
				const char = child.value[i];

				if ("\n\r \t".includes(char)) {
					if (char === '\n') {
						newline = true;
					}

					whitespace = true;
				} else {
					if (whitespace) {
						if (!canExclude || !newline) cur += ' ';
						whitespace = false;
						newline = false;
						canExclude = false;
					}

					cur += char;
				}
			}
		} else if (child.type === 'JSXElement') {
			flush();
			children.push(parse(child));
		} else if (child.type === 'JSXExpressionContainer') {
			flush();

			children.push(child.expression);
		} else if (child.type === 'JSXFragment') {
			flush();

			children.push(createArray(transformChildren(child)));
		} else {
			throw new Error("Unknown AST type for JSX child: " + child.type);
		}
	}

	if (cur) children.push(t.stringLiteral(cur));

	return children;
};

const log = stuff => console.log(util.inspect(stuff, {colors: true, depth: null}));

export const transformBabelAST = (ast) => {
	let hasHTMLImport = false;
	let hasHImport = false;
	let hasObserverImport = false;
	let usingHTMLImport = false;
	const checkImport = (node) => {
		if (node.type !== "Identifier") {
			return;
		}

		if (node.name === 'html') {
			hasHTMLImport = true;
		} else if (node.name === 'Observer') {
			hasObserverImport = true;
		} else if (node.name === 'h') {
			hasHImport = true;
		}
	};

	babelTraverse.default(ast, {
		ImportSpecifier: path => {
			checkImport(path.node.imported);
		},
		ImportDefaultSpecifier: path => {
			checkImport(path.node.local);
		},
		Identifier: path => {
			const ignoredTypes = ['TaggedTemplateExpression', 'ImportSpecifier'];

			if (path.node.name === 'html' &&
					!ignoredTypes.includes(path.parent.type)) {
				usingHTMLImport = true;
			}
		},
	});

	let transformed = false;
	if (hasHTMLImport) {
		babelTraverse.default(ast, {
			TaggedTemplateExpression: path => {
				const node = path.node;
				if (!node.tag || node.tag.name !== 'html') {
					return;
				}

				transformed = true;
				const {expressions, quasis} = node.quasi;
				path.replaceWith(createArray(
					html(quasis.map(node => node.value.raw), ...expressions.map(exp => {
						if (exp.type === 'stringLiteral') {
							return exp.value;
						}

						return exp;
					})).map(node => {
						if (typeof node === 'string') {
							node = t.stringLiteral(node);
						}

						return node;
					})
				));
			},
		});
	}

	if (hasHImport) {
		babelTraverse.default(ast, {
			JSXFragment: path => {
				path.replaceWith(createArray(transformChildren(path.node)));
			},
			JSXElement: path => {
				path.replaceWith(parse(path.node));
			}
		});
	}

	if (transformed) {
		babelTraverse.default(ast, {
			ImportSpecifier: path => {
				if (path.node.imported.type === 'Identifier' && path.node.imported.name === 'html') {
					let stuff = [];
					if (transform) stuff.push(t.importSpecifier(t.identifier("h"), t.identifier("h")));
					if (!hasObserverImport) stuff.push(t.importSpecifier(t.identifier("Observer"), t.identifier("Observer")));
					if (usingHTMLImport) stuff.push(path.node);
					path.replaceWithMultiple(stuff);
				}
			},
		});
	}
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
	import {html} from 'h';
	import Observer from 'dude';

	console.log(html\`<<\`);
`, {plugins: ['jsx']}).code);
*/

export default transform;
