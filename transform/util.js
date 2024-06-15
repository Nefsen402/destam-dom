const assignmentPrototype = {
	rename (name) {
		for (let ident of [...this.assignments, ...this.uses]) {
			ident.name = name;
		}
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
	getScope () {
		let min = Infinity;
		let max = -Infinity;

		for (let ident of [...this.assignments, ...this.uses]) {
			min = Math.min(min, ident.identId);
			max = Math.max(max, ident.identId);
		}

		return [min, max];
	}
};

const createAssignment = (ident, mix) => {
	let obj = Object.create(assignmentPrototype);
	obj.name = ident.name;
	obj.assignments = [];
	obj.uses = [];

	return Object.assign(obj, mix || {});
};

let identId = 0;
const assignIdentifier = (ident, assignment, scope) => {
	ident.assignment = assignment;
	ident.identId = ++identId;

	if (assignment.type === 'var') {
		while (scope.parent && !scope.func) {
			scope = scope.parent;
		}
	}

	ident.scope = scope;
};

export const collectVariables = (node) => {
	const traverseAssignment = (assignments, param) => {
		if (param.type === 'Identifier') {
			assignments.push(param);
		} else if (param.type === 'RestElement') {
			assignments.push(param.argument);
		} else if (param.type === 'ArrayPattern') {
			if (param.elements) for (let elem of param.elements) {
				traverseAssignment(assignments, elem);
			}
		} else if (param.type === 'AssignmentPattern') {
			traverseAssignment(assignments, param.right)
		} else if (param.type === 'ObjectPattern') {
			for (const prop of param.properties) {
				if (prop.type === 'ObjectProperty') {
					traverseAssignment(assignments, prop.value);
				} else if (param.type === 'RestElement') {
					assignments.push(param.argument);
				}
			}
		}
	};

	const collectAssignment = (ident, context, _lets, defs) => {
		let assignment;
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
		}

		assignment.assignments.push(ident);
		assignIdentifier(ident, assignment, context);
		return assignment;
	};

	const getAssignment = (ident, lets) => {
		let assignment;
		let context = lets;
		while (!assignment && context) {
			assignment = context.get(ident.name);
			context = context.parent;
		}

		if (!assignment) {
			lets.set(ident.name, assignment = createAssignment(ident, {type: 'undecl'}));
		}

		assignment.uses.push(ident);
		assignIdentifier(ident, assignment, lets);
		return assignment;
	};

	const undecl = (node, lets) => {
		let idents = [];
		traverseAssignment(idents, node);

		for (const ident of idents) {
			collectAssignment(ident, lets, null, {type: 'undecl'});
		}
	};

	const orphanUndecl = lets => {
		if (lets.parent) for (const assignment of lets.values()) {
			if (assignment.type === 'undecl') {
				if (lets.parent.has(assignment.name)) {
					throw new Error("assert: variable traversal in bad state: " + assignment.name);
				}

				lets.parent.set(assignment.name, assignment);
				lets.delete(assignment.name);
			}
		}
	};

	const traverseFunction = (node, lets, glob) => {
		let idents = [];
		for (let param of node.params) {
			traverseAssignment(idents, param);
		}

		const ret = context(lets);
		ret.func = node;
		ret.returns = [];
		node.assignment = ret;

		if (node.id) (glob ? lets : ret).set(node.id.name, createAssignment(node.id, {
			type: 'function',
			assignments: [node.id],
		}));

		for (const ident of idents) {
			const assignment = createAssignment(ident, {
				type: 'param',
				assignments: [ident],
			});

			ret.set(ident.name, assignment);
			assignIdentifier(ident, assignment, ret);
		}

		if (node.body.type === 'BlockStatement') {
			for (const statement of node.body.body) {
				traverse(statement, ret);
			}
		} else {
			traverseExpression(node.body, ret);
		}

		orphanUndecl(ret);
	};

	const traverseClass = (node, lets, glob) => {
		const cont = context(lets);
		cont.func = node;
		node.assignment = cont;

		if (node.id) (glob ? lets : cont).set(node.id.name, createAssignment(node.id, {
			type: 'class',
			assignments: [node.id],
		}));

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

	const traverseExpression = (node, lets) => {
		if (!lets) throw new Error("assert: lets in null");
		if (!node) throw new Error("assert: node in null");

		if (node.type === 'ArrayExpression') {
			for (const elem of node.elements) {
				if (elem.type === 'SpreadElement') {
					traverseExpression(elem.argument, lets);
				} else {
					traverseExpression(elem, lets);
				}
			}
		} else if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
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
			traverse(node.body, lets);
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
				node.type === 'Super') {
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
		} else if (!node.type.includes("Literal")) {
			throw new Error("Unknown expression: " + node.type);
		}
	};

	const context = parent => {
		const ret = new Map();
		ret.parent = parent;
		ret.children = [];
		if (parent) ret.parent.children.push(ret);
		return ret;
	};

	const traverse = (node, lets) => {
		if (!lets) throw new Error("assert: lets in null");
		if (!node) throw new Error("assert: node in null");

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
					traverseAssignment(idents, decl.id);
				}

				let _lets = lets;
				if (node.kind === 'var') {
					while (_lets.parent && !_lets.func) {
						_lets = _lets.parent;
					}
				}

				for (const ident of idents) {
					const assignment = collectAssignment(ident, lets, _lets);
					assignment.type = node.kind;
					assignment.init = init;
				}
			}
		} else if (node.type === 'BlockStatement') {
			const cont = context(lets);
			for (let i = 0; i < node.body.length; i++) {
				traverse(node.body[i], cont);
			}
			node.assignment = cont;
		} else if (node.type === 'Program') {
			for (let i = 0; i < node.body.length; i++) {
				traverse(node.body[i], lets);
			}
			node.assignment = lets;
		} else if (node.type === 'ExpressionStatement') {
			traverseExpression(node.expression, lets);
		} else if (node.type === 'IfStatement') {
			traverseExpression(node.test, lets);
			traverse(node.consequent, lets);
			if (node.alternate) traverse(node.alternate, lets);
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

			traverse(node.body, cont);
		} else if (node.type === 'ForOfStatement' || node.type === 'ForInStatement') {
			let cont = lets;
			if (node.left.type === 'VariableDeclaration') {
				cont = context(cont);
				traverse(node.left, cont);
			} else {
				undecl(node.left, cont);
			}

			if (node.right) traverseExpression(node.right, cont);
			traverse(node.body, cont);
		} else if (node.type === 'File') {
			traverse(node.program, lets);
		} else if (node.type === 'ImportDeclaration') {
			for (const spec of node.specifiers) {
				const assignment = collectAssignment(spec.local, lets, lets);
				assignment.type = 'import';
				assignment.source = node.source;
				assignment.sourceNode = node;
			}
		} else if (node.type === 'SwitchStatement') {
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
			const assignment = collectAssignment(node.label, lets, lets);
			assignment.type = 'label';
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
			if (node.finalizer) traverse(node.finalizer, lets);

			if (node.handler) {
				const cont = context(lets);
				const idents = [];
				traverseAssignment(idents, node.handler.param);

				for (const ident of idents) {
					const assignment = createAssignment(ident, {
						type: 'param',
						assignments: [ident],
					});

					cont.set(ident.name, assignment);
					assignIdentifier(ident, assignment, cont);
				}

				for (const statement of node.handler.body.body) {
					traverse(statement, cont);
				}

				node.handler.assignment = cont;
				orphanUndecl(cont);
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
				if (spec.type === 'ExportSpcifier') {
					traverseExpression(spec.local, lets);
				} else if (spec.type === 'ExportDefaultDeclaration') {
					traverseExpression(spec.declaration, lets);
				} else if (spec.type === 'ExportNamespaceSpecifier') {
					traverseExpression(spec.exported, lets);
				} else {
					throw new Error("Unknown export: " + spec.type);
				}
			}
		} else if (node.type === 'ClassDeclaration') {
			traverseClass(node, lets, true);
		} else {
			throw new Error("Unknown statement: " + node.type);
		}

		orphanUndecl(lets);
	}

	traverse(node, context());
};

export const checkImport = (node, regex) => {
	if (!regex) {
		return true;
	}

	const source = node.assignment?.source;
	if (!source) {
		return false;
	}

	return regex.test(source.value);
};
