import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * Boundary ratchet for the rules in AGENTS.md that Biome cannot express:
 *
 * 1. The two engines are independent: `src/edopro` and `src/ygopro` never import
 *    each other. Shared behavior belongs in `src/shared` behind a port.
 * 2. Domain code depends on nothing outward: a file under `domain/` never imports
 *    `application/`, `infrastructure/`, the outer layers (HTTP, sockets, boot),
 *    the ORM entities in `evolution-types`, or infrastructure libraries.
 *
 * The lists below hold every violation that existed when the rules were added.
 * A new violation fails this test; so does a listed one that no longer exists,
 * so the lists only shrink. Fix a violation, then delete its line.
 *
 * Tests are exempt. Imports are read with a regex, which is enough for this
 * codebase's `import`/`export ... from`, `import()` and `require()` forms.
 */

const ROOT = resolve(__dirname, "../..");
const SRC = join(ROOT, "src");

const ALIASES: Record<string, string> = {
	"@edopro/": "src/edopro/",
	"@shared/": "src/shared/",
	"@ygopro/": "src/ygopro/",
	"@plugins/": "src/plugins/",
	"@test-support/": "src/test-support/",
	"src/": "src/",
};

const OUTER_LAYERS = [
	"src/http-server/",
	"src/socket-server/",
	"src/web-socket-server/",
	"src/bootstrap/",
];

const INFRASTRUCTURE_PACKAGES = new Set([
	"better-sqlite3",
	"express",
	"ioredis",
	"net",
	"node:net",
	"pg",
	"sql.js",
	"typeorm",
	"ws",
]);

const KNOWN_ENGINE_LEAKS: readonly string[] = [];

const KNOWN_DOMAIN_LEAKS: readonly string[] = [
	"src/edopro/room/domain/Room -> src/edopro/ban-list/infrastructure/BanListMemoryRepository",
	"src/edopro/room/domain/states/dueling/DuelingState -> src/edopro/ban-list/infrastructure/BanListMemoryRepository",
	"src/shared/socket/domain/TCPClientSocket -> net",
	"src/shared/socket/domain/WebSocketClientSocket -> ws",
	"src/ygopro/room/domain/RuleMappings -> src/shared/logger/infrastructure/LoggerFactory",
	"src/ygopro/room/domain/RuleMappings -> src/ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository",
	"src/ygopro/room/domain/YGOProRoom -> src/ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository",
];

type Import = { from: string; to: string };

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			return ["evolution-types", "test-support", "node_modules"].includes(entry.name)
				? []
				: sourceFiles(path);
		}
		const isSource = entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts");

		return isSource && !entry.name.endsWith(".test.ts") ? [path] : [];
	});
}

function specifiers(code: string): string[] {
	const patterns = [
		/(?:import|export)\s[^'";]*?from\s*["']([^"']+)["']/g,
		/import\s*["']([^"']+)["']/g,
		/import\(\s*["']([^"']+)["']\s*\)/g,
		/require\(\s*["']([^"']+)["']\s*\)/g,
	];

	return patterns.flatMap((pattern) => [...code.matchAll(pattern)].map((match) => match[1]));
}

/** Repo-relative path without extension for source imports, the bare name for packages. */
function resolveSpecifier(file: string, specifier: string): string {
	if (specifier.startsWith(".")) {
		return relative(ROOT, resolve(dirname(file), specifier));
	}
	const alias = Object.keys(ALIASES).find((prefix) => specifier.startsWith(prefix));

	return alias ? ALIASES[alias] + specifier.slice(alias.length) : specifier;
}

function collectImports(): Import[] {
	return sourceFiles(SRC).flatMap((file) => {
		const from = relative(ROOT, file).replace(/\.ts$/, "");

		return specifiers(readFileSync(file, "utf8")).map((specifier) => ({
			from,
			to: resolveSpecifier(file, specifier).replace(/\.(ts|js)$/, ""),
		}));
	});
}

function engineOf(path: string): "edopro" | "ygopro" | undefined {
	if (path.startsWith("src/edopro/")) {
		return "edopro";
	}
	if (path.startsWith("src/ygopro/")) {
		return "ygopro";
	}

	return undefined;
}

/** The innermost layer folder a path sits in, if any. */
function layerOf(path: string): string | undefined {
	return path
		.split("/")
		.filter((segment) => ["domain", "application", "infrastructure"].includes(segment))
		.at(-1);
}

function isOutward(to: string): boolean {
	const layer = layerOf(to);

	return (
		layer === "application" ||
		layer === "infrastructure" ||
		OUTER_LAYERS.some((outer) => to.startsWith(outer)) ||
		to.startsWith("src/evolution-types/") ||
		INFRASTRUCTURE_PACKAGES.has(to)
	);
}

function unique(values: string[]): string[] {
	return [...new Set(values)].sort();
}

function expectRatchet(actual: string[], known: readonly string[]): void {
	const added = actual.filter((entry) => !known.includes(entry));
	const fixed = known.filter((entry) => !actual.includes(entry));

	expect({ added, fixed }).toEqual({ added: [], fixed: [] });
}

describe("module boundaries", () => {
	const imports = collectImports();

	it("keeps the edopro and ygopro engines from importing each other", () => {
		const leaks = imports.filter(({ from, to }) => {
			const source = engineOf(from);
			const target = engineOf(to);

			return source !== undefined && target !== undefined && source !== target;
		});

		expectRatchet(unique(leaks.map(({ from, to }) => `${from} -> ${to}`)), KNOWN_ENGINE_LEAKS);
	});

	it("keeps domain code from importing outward layers", () => {
		const leaks = imports.filter(({ from, to }) => layerOf(from) === "domain" && isOutward(to));

		expectRatchet(unique(leaks.map(({ from, to }) => `${from} -> ${to}`)), KNOWN_DOMAIN_LEAKS);
	});
});
