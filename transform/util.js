import t from '@babel/types';

const assignmentPrototype = {
	rename (name) {
		for (let ident of [...this.assignments, ...this.uses]) {
			ident.name = name;
		}

		this.name = name;
	},
	replace (assignment) {
		for (let ident of this.assignments) {
			ident.assignment = assignment;
			ident.name = assignment.name;
			assignment.assignments.push(ident);
		}

		for (let ident of this.uses) {
			ident.assignment = assignment;
			ident.name = assignment.name;
			assignment.uses.push(ident);
		}

		this.assignments.splice(0, this.assignments.length);
		this.uses.splice(0, this.uses.length);
	},
};

const createAssignment = (ident, mix) => {
	let obj = Object.create(assignmentPrototype);
	obj.name = ident.name;
	obj.assignments = [];
	obj.uses = [];

	return Object.assign(obj, mix || {});
};

export const context = parent => {
	const ret = new Map();
	ret.parent = parent;
	ret.children = [];
	ret.unassigned = [];

	ret.search = name => {
		let current = ret;
		while (current) {
			const found = current.get(name) || current.unassigned.find(a => a.name === name);
			if (found) return found;

			current = current.parent;
		}

		return null;
	};

	if (parent) ret.parent.children.push(ret);
	return ret;
};

export const collectVariables = (node, seeker, cont) => {
	const traverseAssignment = (assignments, param, lets) => {
		if (param.type === 'Identifier') {
			assignments.push(param);
		} else if (param.type === 'RestElement') {
			assignments.push(param.argument);
		} else if (param.type === 'ArrayPattern') {
			if (param.elements) for (let elem of param.elements) {
				if (elem) traverseAssignment(assignments, elem, lets);
			}
		} else if (param.type === 'AssignmentPattern') {
			traverseAssignment(assignments, param.left, lets);
			if (param.right) traverseExpression(param.right, lets);
		} else if (param.type === 'ObjectPattern') {
			for (const prop of param.properties) {
				if (prop.type === 'ObjectProperty') {
					traverseAssignment(assignments, prop.value, lets);
				} else if (param.type === 'RestElement') {
					assignments.push(param.argument);
				}
			}
		} else if (param.type === 'MemberExpression') {
			traverseExpression(param, lets);
		} else {
			throw new Error("Unknown assignment type: " + param.type);
		}
	};

	const collectAssignment = (ident, context, _lets, defs) => {
		let assignment = ident.assignment;
		let orig = context;
		while (context && !assignment) {
			assignment = context.get(ident.name);
			if (!context.parent) {
				if (_lets && _lets !== context) throw new Error("assert: Expected _lets to be null");
				_lets = context;
			}

			if (context === _lets) break;
			context = context.parent;
		}

		if (!assignment) {
			_lets.set(ident.name, assignment = createAssignment(ident, defs));
			assignment.rootScope = _lets;
		} else if (defs) {
			// javascript maps are ordered. Make sure the order matches how they
			// are assigned.
			if (!assignment.type && _lets.delete(ident.name)) {
				_lets.set(ident.name, assignment);
			}

			for (let o in defs) {
				assignment[o] = defs[o];
			}

			if (assignment.unassigned) {
				assignment.unassigned = false;
				_lets.unassigned.push(assignment);
			}
		}

		if (!assignment.assignments.includes(ident)) {
			assignment.assignments.push(ident);
		}

		ident.assignment = assignment;
		ident.scope = orig;
		return assignment;
	};

	const getAssignment = (ident, lets) => {
		let assignment = ident.assignment || lets.get(ident.name);
		if (!assignment) {
			lets.set(ident.name, assignment = createAssignment(ident));
			assignment.rootScope = lets;
		}

		if (!assignment.uses.includes(ident)) {
			assignment.uses.push(ident);
		}

		ident.assignment = assignment;
		ident.scope = lets;
		return assignment;
	};

	const undecl = (node, lets) => {
		let idents = [];
		traverseAssignment(idents, node, lets);

		for (const ident of idents) {
			collectAssignment(ident, lets, null);
		}
	};

	const orphanUndecl = lets => {
		if (lets.parent) for (const assignment of lets.values()) {
			if (!assignment.type) {
				if (lets.parent.has(assignment.name)) {
					assignment.replace(lets.parent.get(assignment.name));
				} else {
					lets.parent.set(assignment.name, assignment);
				}

				lets.delete(assignment.name);
			}
		}
	};

	const traverseBody = (node, name, scope) => {
		let type = 'body';
		let current = node[name];
		scope.body = () => {
			let child = current;

			const get = () => {
				if (type === 'expression') {
					type = 'body';
					child = t.returnStatement(node[name]);
					node[name] = t.blockStatement([child]);
				} else if (type === 'statement') {
					type = 'body';
					child = t.expressionStatement(node[name]);
					node[name] = t.blockStatement([child]);
				}

				return node[name];
			};

			return {
				scope,
				get,
				placeBefore: (...nodes) => {
					let index = get().body.indexOf(child);
					if (index === -1) throw new Error("Couldn't find node to place before");

					get().body.splice(index, 0, ...nodes);
				},
			};
		};

		const body = node[name];
		if (['BlockStatement', 'Program'].includes(body.type)) {
			for (current of [...body.body]) {
				traverse(current, scope);
			}
		} else {
			type = 'statement';

			if (traverse(body, scope, true)) {
				type = 'expression';
				traverseExpression(body, scope, true);
			}
		}

		orphanUndecl(scope);
	};

	const traverseFunction = (node, lets, glob) => {
		const ret = context(lets);
		ret.func = node;
		node.scope = ret;

		let idents = [];
		for (let param of node.params) {
			traverseAssignment(idents, param, ret);
		}

		ret.returns = [];

		if (node.id) collectAssignment(node.id, glob ? lets : ret, glob ? lets : ret, {
			type: 'function',
		});

		for (const ident of idents) {
			collectAssignment(ident, ret, ret, {
				type: 'param',
			});
		}

		traverseBody(node, 'body', ret);
	};

	const traverseClass = (node, lets, glob) => {
		const cont = context(lets);
		cont.func = node;

		if (node.id) collectAssignment(node.id, glob ? lets : cont, glob ? lets : cont, {
			type: 'class',
		});

		if (node.superClass) traverseExpression(node.superClass, cont);

		for (const cnode of node.body.body) {
			if (cnode.type === 'ClassMethod' || cnode.type === 'ClassPrivateMethod') {
				if (cnode.computed) {
					traverseExpression(cnode.key, cont);
				}

				traverseFunction(cnode, cont);
			} else if (cnode.type === 'ClassProperty') {
				if (cnode.computed) {
					traverseExpression(cnode.key, cont);
				}

				traverseExpression(cnode.value, cont);
			} else if (cnode.type === 'ClassPrivateProperty') {
				traverseExpression(cnode.value, cont);
			} else {
				throw new Error("Unknown class node: " + cnode.type);
			}
		}

		orphanUndecl(cont);
	};

	const traverseExpression = (node, lets, noCallSeeker) => {
		if (!lets) throw new Error("assert: lets in null");
		if (!node) throw new Error("assert: node in null");

		if (!noCallSeeker && seeker && seeker(node, lets)) return;

		if (node.type === 'ArrayExpression') {
			for (const elem of node.elements) {
				if (elem.type === 'SpreadElement') {
					traverseExpression(elem.argument, lets);
				} else {
					traverseExpression(elem, lets);
				}
			}
		} else if (node.type === 'ArrowFunctionExpression' ||
				node.type === 'FunctionDeclaration' ||
				node.type === 'FunctionExpression') {
			traverseFunction(node, lets);
		} else if (node.type === 'AssignmentExpression') {
			traverseExpression(node.right, lets);
			undecl(node.left, lets);
		} else if (node.type === 'AwaitExpression' ||
				node.type === 'UnaryExpression' ||
				node.type === 'UpdateExpression') {
			traverseExpression(node.argument, lets);
		} else if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
			traverseExpression(node.left, lets);
			traverseExpression(node.right, lets);
		} else if (node.type === 'BindExpression') {
			traverseExpression(node.object, lets);
			traverseExpression(node.callee, lets);
		} else if (node.type === 'CallExpression' ||
				node.type === 'NewExpression' ||
				node.type === 'OptionalCallExpression') {
			traverseExpression(node.callee, lets);

			for (let arg of node.arguments) {
				if (arg.type === 'SpreadElement') {
					traverseExpression(arg.argument, lets);
				} else {
					traverseExpression(arg, lets);
				}
			}
		} else if (node.type === 'ClassExpression') {
			traverseClass(node, lets);
		} else if (node.type === 'ConditionalExpression') {
			traverseExpression(node.test, lets);
			traverseExpression(node.consequent, lets);
			traverseExpression(node.alternate, lets);
		} else if (node.type === 'DoExpression') {
			traverseBody(node, 'body', context(lets));
		} else if (node.type === 'Identifier') {
			getAssignment(node, lets);
		} else if (node.type === 'ImportExpression') {
			traverseExpression(node.source, lets);
			if (node.options) traverseExpression(node.options);
		} else if (node.type === 'MemberExpression' ||
				node.type === 'OptionalMemberExpression') {
			traverseExpression(node.object, lets);
			if (node.computed) {
				traverseExpression(node.property, lets);
			}
		} else if (node.type === 'ObjectExpression') {
			for (const prop of node.properties) {
				if (prop.type === 'SpreadElement') {
					traverseExpression(prop.argument, lets);
				} else if (prop.type === 'ObjectMethod') {
					if (prop.computed) traverseExpression(prop.key, lets);
					traverseFunction(prop, lets);
				} else {
					if (prop.computed) traverseExpression(prop.key, lets);
					traverseExpression(prop.value, lets);
				}
			}
		} else if (node.type === 'ParenthesizedExpression') {
			traverseExpression(node.expression, lets);
		} else if (node.type === 'SequenceExpression') {
			for (const exp of node.expressions) {
				traverseExpression(exp, lets);
			}
		} else if (node.type === 'ThisExpression' ||
				node.type === 'YieldExpression' ||
				node.type === 'DebuggerExpression' ||
				node.type === 'Super' ||
				node.type === 'Import') {
			//fallthrough
		} else if (node.type === 'TemplateLiteral') {
			for (const exp of node.expressions) {
				traverseExpression(exp, lets);
			}
		} else if (node.type === 'TaggedTemplateExpression') {
			traverseExpression(node.tag, lets);

			for (const exp of node.quasi.expressions) {
				traverseExpression(exp, lets);
			}
		} else if (node.type === 'JSXElement') {
			for (const attr of node.openingElement.attributes) {
				if (attr.type === 'JSXSpreadChild') {
					traverseExpression(node.expression, lets);
				} else {
					if (attr.value) traverseExpression(attr.value, lets);
				}
			}

			if (node.children) for (const child of node.children) {
				traverseExpression(child, lets);
			}
		} else if (node.type === 'JSXExpressionContainer') {
			traverseExpression(node.expression, lets);
		} else if (node.type === 'JSXFragment') {
			for (const child of node.children) {
				if (child.type === 'JSXSpreadChild') {
					traverseExpression(child.expression, lets);
				} else {
					traverseExpression(child, lets);
				}
			}
		} else if (node.type === 'JSXText' || node.type === 'JSXEmptyExpression') {
			// fallthrough
		} else if (node.type === 'ClassDeclaration') {
			traverseClass(node, lets, true);
		} else if (node.type === 'TSAsExpression') {
			traverseExpression(node.expression, lets);
		} else if (!node.type.includes("Literal")) {
			throw new Error("Unknown expression: " + node.type);
		}
	};

	const traverse = (node, lets, noFail) => {
		if (!lets) throw new Error("assert: lets in null");
		if (!node) throw new Error("assert: node in null");

		if (node.type === 'BlockStatement') {
			lets = context(lets);
		}

		if (seeker && seeker(node, lets)) return;

		if (node.type.includes("Function")) {
			traverseFunction(node, lets, true);
		} else if (node.type === 'VariableDeclaration') {
			for (let decl of node.declarations) {
				if (decl.init) {
					traverseExpression(decl.init, lets);
				}

				let idents = [];
				let init;

				if (decl.id.type === 'Identifier') {
					idents.push(decl.id);
					init = decl.init;
				} else {
					traverseAssignment(idents, decl.id, lets);
				}

				let _lets = lets;
				if (node.kind === 'var') {
					while (_lets.parent && !_lets.func) {
						_lets = _lets.parent;
					}
				}

				for (const ident of idents) {
					collectAssignment(ident, lets, _lets, {
						type: node.kind,
						init,
					});
				}
			}
		} else if (node.type === 'BlockStatement' || node.type === 'Program') {
			traverseBody({node}, 'node', lets);
		} else if (node.type === 'ExpressionStatement') {
			traverseExpression(node.expression, lets);
		} else if (node.type === 'IfStatement') {
			traverseExpression(node.test, lets);

			traverseBody(node, 'consequent', context(lets));
			if (node.alternate) traverseBody(node, 'alternate', context(lets));
		} else if (node.type === 'ForStatement') {
			const cont = context(lets);
			if (node.init) {
				if (node.init.type === 'VariableDeclaration') {
					traverse(node.init, cont);
				} else {
					traverseExpression(node.init, cont);
				}
			}

			if (node.test) traverseExpression(node.test, cont);
			if (node.update) traverseExpression(node.update, cont);

			traverseBody(node, 'body', cont);
		} else if (node.type === 'ForOfStatement' || node.type === 'ForInStatement') {
			let cont = context(lets);
			if (node.left.type === 'VariableDeclaration') {
				traverse(node.left, cont);
			} else {
				undecl(node.left, cont);
			}

			if (node.right) traverseExpression(node.right, cont);
			traverseBody(node, 'body', cont);
		} else if (node.type === 'File') {
			traverse(node.program, lets);
		} else if (node.type === 'ImportDeclaration') {
			for (const spec of node.specifiers) {
				collectAssignment(spec.local, lets, lets, {
					type: 'import',
					source: node.source,
					sourceNode: node,
				});
			}
		}else if (node.type === 'SwitchStatement') {
			traverseExpression(node.discriminant, lets);

			const cont = context(lets);
			for (const c of node.cases) {
				if (node.test) traverseExpression(node.test, cont);

				for (let statement of c.consequent) {
					traverse(statement, cont);
				}
			}

			orphanUndecl(cont);
		} else if (node.type === 'LabeledStatement') {
			collectAssignment(node.label, lets, lets, {
				type: 'label',
			});
			traverse(node.body, lets);
		} else if (node.type === 'ThrowStatement') {
			traverseExpression(node.argument, lets);
		} else if (node.type === 'ReturnStatement') {
			let context = lets;
			while (context && !context.func) {
				context = context.parent;
			}

			if (context) context.returns.push(node);

			if (node.argument) traverseExpression(node.argument, lets);
		} else if (node.type === 'BreakStatement' || node.type === 'ContinueStatement') {
			if (node.label) {
				const assignment = getAssignment(node.label, lets);
				assignment.type = 'label';
			}
		} else if (node.type === 'TryStatement') {
			traverse(node.block, lets);
			if (node.finalizer) {
				traverseBody(node, 'finalizer', context(lets));
			}

			if (node.handler) {
				const cont = context(lets);
				const idents = [];
				if (node.handler.param) traverseAssignment(idents, node.handler.param, cont);

				for (const ident of idents) {
					collectAssignment(ident, cont, cont, {
						type: 'param',
					});
				}

				traverseBody(node.handler, 'body', cont);
			}
		} else if (node.type === 'WhileStatement' || node.type === 'DoWhileStatement') {
			traverseExpression(node.test, lets);
			traverse(node.body, lets);
		} else if (node.type === 'ExportAllDeclaration' || node.type === 'EmptyStatement') {
			// fallthrough
		} else if (node.type === 'ExportDefaultDeclaration') {
			traverseExpression(node.declaration, lets);
		} else if (node.type === 'ExportNamedDeclaration') {
			if (node.declaration) traverse(node.declaration, lets);

			for (let spec of node.specifiers) {
				if (spec.type === 'ExportSpecifier') {
					traverseExpression(spec.local, lets);
				} else if (spec.type === 'ExportDefaultDeclaration') {
					traverseExpression(spec.declaration, lets);
				} else if (spec.type === 'ExportNamespaceSpecifier') {
					traverseExpression(spec.exported, lets);
				} else {
					throw new Error("Unknown export: " + spec.type);
				}
			}
		} else if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
			traverseClass(node, lets, true);
		} else if (node.type.startsWith('TS')) {
			// ignore ts
		} else {
			if (!noFail) {
				throw new Error("Unknown statement: " + node.type);
			}

			return true;
		}

		return false;
	};

	if (traverse(node, cont || (cont = context()), true)) {
		traverseExpression(node, cont, true);
	}

	return cont;
};

const allowedNameCharsFirst = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_';
const allowedNameChars = allowedNameCharsFirst + '0123456789';
export const assignVariables = scope => {
	const globalTaken = [
		'let', 'const', 'class', 'var', 'function', 'of', 'in', 'for', 'while',
		'do', 'if', 'else', 'try', 'catch', 'finally', 'export', 'import',
		'default', 'switch', 'case', 'break', 'continue', 'throw', 'new', 'this',
		'return', 'from', 'as', 'null', 'undefined', 'true', 'false', 'debugger',
		'with',
	];

	const used = new Map();
	const vals = [];

	const collect = (assignment, scope) => {
		for (const use of [...assignment.assignments, ...assignment.uses]) {
			let current = use.scope;

			while (current && current !== scope.parent) {
				let list = used.get(current);
				if (!list) used.set(current, list = new Set());
				list.add(assignment);

				current = current.parent;
			}
		}
	};

	const traverse = (scope, undef) => {
		for (const assignment of scope.values()) {
			collect(assignment, scope);
		}

		for (const assignment of scope.unassigned) {
			vals.push([assignment, scope]);
		}

		scope.unassigned.length = 0;

		for (const child of scope.children) {
			traverse(child);
		}
	};

	traverse(scope, scope);

	vals.sort(([a], [b]) => {
		if (a.name && !b.name) return -1;
		if (!b.name && a.name) return 1;

		return b.assignments.length + b.uses.length -
			a.assignments.length - a.uses.length;
	});

	for (const [assignment, scope] of vals) {
		const taken = new Set(globalTaken);

		for (const use of [...assignment.assignments, ...assignment.uses]) {
			let current = use.scope;
			while (current !== scope.parent) {
				const thing = used.get(current);
				if (thing) for (let t of thing) {
					taken.add(t.name);
				}

				current = current.parent;
			}
		}

		let name = assignment.name;
		for (let i = 0; !name || taken.has(name); i++) {
			name = '';

			let num = i;
			do {
				const chars = name.length ? allowedNameChars : allowedNameCharsFirst;

				name += chars[num % chars.length];
				num = Math.floor(num / chars.length);
			} while(num);
		}

		scope.set(name, assignment);
		assignment.rootScope = scope;
		assignment.rename(name);
		collect(assignment, scope);
	}
};

export const unallocate = (scope) => {
	const traverse = scope => {
		for (const assignment of scope.values()) {
			scope.unassigned.push(assignment);
			assignment.rootScope = null;
			assignment.name = null;
		}

		scope.clear();

		for (const child of scope.children) {
			traverse(child);
		}
	};

	traverse(scope);
};

export const createIdent = (scope, options) => {
	const ident = t.identifier('');
	ident.assignment = createAssignment(ident, {
		unassigned: true,
		name: '',
		...options,
	});

	if (scope) {
		ident.scope = scope;
		scope.unassigned.push(ident.assignment);
		ident.assignment.assignments.push(ident);
	}

	return ident;
};

export const createUse = (ident, scope) => {
	let assignment;
	if (ident.type === "Identifier") {
		assignment = ident.assignment;
	} else if (Object.getPrototypeOf(ident) === assignmentPrototype){
		assignment = ident;
	} else {
		return ident;
	}

	if (assignment.rootScope) {
		assignment.rootScope.delete(assignment.name);
		assignment.rootScope.unassigned.push(assignment);
		assignment.rootScope = null;
	}

	const ret = t.identifier(assignment.name);
	ret.assignment = assignment;

	if (scope) {
		ret.scope = scope;
		assignment.uses.push(ret);
	}

	return ret;
};

export const checkImport = (node, regex) => {
	if (!regex) {
		return true;
	}

	let assignment = node;
	if (node.type === 'Identifier') {
		assignment = node.assignment;
	}

	const source = assignment?.source;
	if (!source) {
		return false;
	}

	return regex.test(source.value);
};
