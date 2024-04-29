import parser from '@babel/parser';
import generate from '@babel/generator';
import babelTraverse from '@babel/traverse';
import t from '@babel/types';
import util from 'util';
import htm, {validTags} from '../htm.js';

let currentTag = 'h';
const createTag = (args, tagName) => {
	const expr = t.callExpression(t.identifier(tagName), args);
	return expr;
};

const createArray = (items) => {
	if (items.length === 1) {
		return items[0];
	} else {
		return t.arrayExpression(items);
	}
};

const spreadKeys = Symbol();

const html = htm((name, props, ...children) => {
	const args = [
		typeof name === 'string' ? t.stringLiteral(name) : name,
	];

	if (Object.keys(props).length || children.length) {
		args.push(t.objectExpression(Object.entries(props).map(([key, val]) => {
			if (props[spreadKeys]?.includes(key)) {
				return t.spreadElement(val);
			}

			if (val === true) {
				val = t.booleanLiteral(val);
			}

			if (typeof key === 'string') {
				key = t.stringLiteral(key);
			}

			if (typeof val === 'string') {
				val = t.stringLiteral(val);
			}

			return t.objectProperty(key, val);
		})));
	}

	args.push(...children.map(child => {
		if (typeof child === 'string') {
			return t.stringLiteral(child);
		} else if (child === null) {
			return t.identifier('null');
		} else {
			return child;
		}
	}));

	return createTag(args, currentTag);
}, (props, obj) => {
	const key = '~spread-' + Math.random();

	if (!props[spreadKeys]) props[spreadKeys] = [];
	props[spreadKeys].push(key);

	props[key] = obj;
}, strings => {
	if (strings.length === 1) {
		return strings[0]
	}

	return t.callExpression(
		t.memberExpression(t.arrayExpression(strings.map(string => {
			if (typeof string === 'string') {
				string = t.stringLiteral(string);
			}

			return string;
		})), t.identifier('join')),
		[t.stringLiteral("")],
	);
});

const jsxName = (name, check) => {
	if (name[0].toLowerCase() !== name[0]) {
		return t.identifier(name);
	} else {
		if (check && !validTags.includes(name.toUpperCase()) && !name.includes('-')) {
			throw new Error("Invalid tag name: " + name);
		}

		return t.stringLiteral(name);
	}
};

const parse = node => {
	let impl = 'h';
	let name = node.openingElement.name;
	if (name.type === 'JSXNamespacedName') {
		impl = name.namespace.name;
		name = jsxName(name.name.name, false);
	}

	if (name.type === 'JSXIdentifier') {
		name = jsxName(name.name, true);
	}

	const args = [
		name,
	];

	const children = transformChildren(node);
	if (children || node.openingElement.attributes.length) {
		args.push(t.objectExpression(node.openingElement.attributes.map(attr => {
			if (attr.type === 'JSXSpreadAttribute') {
				return t.spreadElement(attr.argument);
			}

			let {name, value} = attr;
			if (!value) {
				value = t.booleanLiteral(true);
			} else if (value.type === 'JSXExpressionContainer') {
				value = value.expression;
			}

			if (name.type !== 'JSXIdentifier') {
				throw new Error("Attribute name must be an identifier");
			}

			return t.objectProperty(t.stringLiteral(name.name), value);
		})));
	}

	if (children) {
		if (!children.length) {
			args.push(t.identifier('null'));
		} else {
			args.push(...children);
		}
	}

	return createTag(args, impl);
};

const transformChildren = node => {
	if (node.type !== 'JSXFragment' && !node.closingElement) {
		if (node.children.length) throw new Error("Expected no children if there is no closing element");
		return null;
	}

	const children = [];
	let canExclude = true, newline = false, whitespace = false, cur = '';

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

			continue;
		}

		flush();

		if (child.type === 'JSXElement') {
			children.push(parse(child));
		} else if (child.type === 'JSXExpressionContainer') {
			if (child.expression.type !== 'JSXEmptyExpression') {
				children.push(child.expression);
			}
		} else if (child.type === 'JSXFragment') {
			children.push(...transformChildren(child));
		} else if (child.type === 'JSXSpreadChild') {
			children.push(t.spreadElement(child.expression));
		} else {
			throw new Error("Unknown AST type for JSX child: " + child.type);
		}
	}

	flush();
	return children;
};

export const transformBabelAST = (ast, options = {}) => {
	const globalTags = options.tags || {
		'html': 'h',
	};

	const imports = new Map();
	const checkImport = (node, path) => {
		if (node.type !== "Identifier") {
			return;
		}

		imports.set(node.name, path);
	};

	babelTraverse.default(ast, {
		ImportSpecifier: path => {
			checkImport(path.node.imported, path);
		},
		ImportDefaultSpecifier: path => {
			checkImport(path.node.local, path);
		},
		VariableDeclaration: path => {
			if (!imports.has('htm')) return;

			let tags = null;

			for (let i = 0; i < path.node.declarations.length; i++) {
				const decl = path.node.declarations[i];
				if (decl.id.type === 'Identifier' &&
						decl.init.type === 'CallExpression' &&
						decl.init.callee.type === 'Identifier' &&
						decl.init.callee.name === 'htm' &&
						decl.init.arguments.length === 1 &&
						decl.init.arguments[0].type === 'Identifier') {
					(tags || (tags = {}))[decl.id.name] = decl.init.arguments[0].name;
					path.node.declarations.splice(i--, 1);
				}
			}

			if (path.node.declarations.length === 0) {
				path.replaceWithMultiple([]);
			}

			if (tags) path.parentPath.destam_tags = tags;
		},
		TaggedTemplateExpression: path => {
			const node = path.node;
			if (!node.tag) {
				return;
			}

			let tags = {...globalTags};

			if (!imports.has(node.tag.name)) {
				// check local variables
				let current = path;
				while (current) {
					if (current.destam_tags) tags = {...tags, ...current.destam_tags};
					current = current.parentPath;
				}
			}

			if (!(node.tag.name in tags)) {
				return;
			}

			currentTag = tags[node.tag.name];
			if (node.tag.name in globalTags && !imports.get(currentTag)) {
				const im = imports.get(node.tag.name);

				im.replaceWithMultiple([
					t.importSpecifier(t.identifier(currentTag), t.identifier(currentTag))
				]);

				imports.delete(node.tag.name);
				imports.set(tags[node.tag.name], im);
			}

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
		JSXFragment: path => {
			path.replaceWith(t.arrayExpression(transformChildren(path.node)));
		},
		JSXElement: path => {
			path.replaceWith(parse(path.node));
		},
	});
};

const transform = (source, options = {}) => {
	const ast = parser.parse(source, {sourceType: 'module', ...options, code: false, ast: true});

	transformBabelAST(ast, options);

	return generate.default(ast, {
		sourceMaps: true,
		...options,
	}, source);
};

export default transform;
