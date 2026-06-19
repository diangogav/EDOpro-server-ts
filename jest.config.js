const { pathsToModuleNameMapper } = require("ts-jest");
const { compilerOptions } = require("./tsconfig");

module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	modulePaths: [compilerOptions.baseUrl],
	moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths),
	roots: ["<rootDir>/src"],
	maxWorkers: "50%",
	transform: {
		"^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
	},
};