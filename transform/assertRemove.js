import babelTraverse from '@babel/traverse';

import { createTransform } from './util.js';

export const transformBabelAST = (ast) => {
	babelTraverse.default(ast, {
		CallExpression: path => {
			if (path.node.callee.type === 'Identifier' && path.node.callee.name === 'assert') {
				path.replaceWithMultiple([]);
			}
		}
	});
};

export default createTransform(transformBabelAST);
