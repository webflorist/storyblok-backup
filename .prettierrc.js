module.exports = {
	semi: false,
	singleQuote: true,
	useTabs: true,
	tabWidth: 4,
	printWidth: 100,
	trailingComma: 'es5',
	overrides: [
		{
			files: '**/*.md',
			options: {
				tabWidth: 2,
			},
		},
	],
}
