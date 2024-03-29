import parser from '@babel/parser';
import generate from '@babel/generator';
import babelTraverse from '@babel/traverse';

const transformBabelAST = (ast) => {
	babelTraverse.default(ast, {
		CallExpression: path => {
			if (path.node.callee.type === 'Identifier' && path.node.callee.name === 'assert') {
				path.replaceWithMultiple([]);
			}
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

export default transform;
