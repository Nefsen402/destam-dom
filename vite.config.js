import { resolve } from 'path'
import { defineConfig } from 'vite'
import unsafeVars from './transform/unsafe-variables';
import compileHTMLLiteral from './transform/htmlLiteral';
import fs from 'fs';

const libs = {
	destamd: {
		entry: resolve(__dirname, 'index.js'),
		fileName: 'destam-dom',
	},
	tracking: {
		entry: resolve(__dirname, 'tracking.js'),
		fileName: 'tracking',
	},
};

const lib = process.env.LIB;

export default defineConfig({
	...(!(lib in libs) ? (() => {
		const pages = fs.readdirSync(resolve(__dirname, 'pages')).map(file => {
			let i = file.lastIndexOf('.');
			const name = file.substring(0, i);

			return [name, resolve(__dirname, 'pages/' + file)];
		});
		return {
			plugins: [
				{
					name: 'transform-literal-html',
					transform(code, id) {
						if (id.endsWith('.js')) {
							const transform = compileHTMLLiteral(code, {
								sourceFileName: id,
								plugins: ['jsx'],
							});

							return {
								code: transform.code,
								map: transform.decodedMap,
							};
						}
					}
				}
			],
			build: {
				rollupOptions: {
					input: Object.fromEntries(pages),
				},
			},
		};
	})() : {
		build: {
			minify: 'terser',
			target: 'es2020',
			terserOptions: {
				compress: {
					unsafe_math: true,
					unsafe_comps: true,
					unsafe_symbols: true,
					ecma: 2020,
					passes: 2,
				},
				mangle: {
					properties: {
						regex: /_$/,
					}
				}
			},
			lib: {
				...libs[lib],
				name: lib,
				formats: ['es', 'iife'],
			},
			sourcemap: true,
			rollupOptions: {
				plugins: [
					{
						name: 'drop-const',
						transform(code, id) {
							if (id.endsWith('.js')) {
								const transform = unsafeVars(code, {
									sourceFileName: id,
								});

								return {
									code: transform.code,
									map: transform.decodedMap,
								};
							}
						}
					},
				],
			},
		},
	}),
})
