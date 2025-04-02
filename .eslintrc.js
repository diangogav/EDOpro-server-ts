module.exports = {
	extends: ["eslint-config-codely/typescript"],
	overrides: [
		{
			files: ["*.ts", "*.tsx"],
			parserOptions: {
				project: ["./tsconfig.eslint.json"],
			},
		},
	],
	plugins: ["import"],
	rules: {
		// turn on errors for missing imports
		"import/no-unresolved": "error",
	},
	settings: {
		"import/parsers": {
			"@typescript-eslint/parser": [".ts", ".tsx"],
		},
		"import/resolver": {
			typescript: {
				alwaysTryTypes: true, // always try to resolve types under `<root>@types` directory even it doesn't contain any source code, like `@types/unist`
				project: "./tsconfig.eslint.json",
			},
		},
	},
};
