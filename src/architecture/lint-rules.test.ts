import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

/**
 * Rule tests for the conventions that `biome.json` enforces.
 *
 * Each rule runs against a scratch copy of the real configuration (VCS off, so
 * files outside the repository are linted):
 *
 * - red: a violation inside the rule's scope is reported;
 * - green: code that follows the convention is not.
 *
 * Baselines: a rule added after the code it governs lists the files that broke
 * it on that day as `!path` entries in the `includes` of its override. A
 * baseline only shrinks: the last test fails when a listed file no longer
 * breaks its rule. Migrate a file by fixing it, then deleting its `!` line.
 * A `!` entry with a glob (`*`, `?`, `[`, `{`) narrows the scope of the rule
 * instead, and stays.
 */

const ROOT = resolve(__dirname, "../..");
const BIOME = join(ROOT, "node_modules/.bin/biome");

type Override = {
	includes: string[];
	plugins?: string[];
	linter?: { rules?: Record<string, Record<string, unknown>> };
};
type BiomeConfig = { vcs?: Record<string, unknown>; overrides: Override[] };
type Diagnostic = { category: string; location: { path: string } };

/** A `!path` entry without glob characters: one file of a baseline. */
const isBaselineEntry = (entry: string): boolean => entry.startsWith("!") && !/[*?[{]/.test(entry);

const realConfig = (): BiomeConfig =>
	JSON.parse(readFileSync(join(ROOT, "biome.json"), "utf8")) as BiomeConfig;

/** Lints `files` (repo-relative path → content) in a scratch project and returns its diagnostics. */
function lint(files: Record<string, string>, config: BiomeConfig = realConfig()): Diagnostic[] {
	const project = mkdtempSync(join(tmpdir(), "lint-rules-"));
	try {
		writeFileSync(
			join(project, "biome.json"),
			JSON.stringify({ ...config, vcs: { enabled: false } }),
		);
		if (existsSync(join(ROOT, "lint"))) {
			cpSync(join(ROOT, "lint"), join(project, "lint"), { recursive: true });
		}
		for (const [path, content] of Object.entries(files)) {
			mkdirSync(dirname(join(project, path)), { recursive: true });
			writeFileSync(join(project, path), content);
		}
		const run = spawnSync(
			BIOME,
			[
				"lint",
				"--reporter=json",
				"--max-diagnostics=none",
				`--config-path=${project}`,
				...Object.keys(files).map((path) => join(project, path)),
			],
			{ cwd: project, encoding: "utf8" },
		);
		const report = JSON.parse(run.stdout) as { diagnostics: Diagnostic[] };

		return report.diagnostics.map((diagnostic) => ({
			...diagnostic,
			location: { path: relative(project, resolve(project, diagnostic.location.path)) },
		}));
	} finally {
		rmSync(project, { recursive: true, force: true });
	}
}

/** The diagnostic category a rule reports: `lint/<group>/<rule>`, or `plugin` for a GritQL plugin. */
function categoryOf(override: Override): string {
	if (override.plugins) {
		return "plugin";
	}
	const [group, rules] = Object.entries(override.linter?.rules ?? {})[0];

	return `lint/${group}/${Object.keys(rules)[0]}`;
}

type RuleCase = { rule: string; path: string; red: string; green: string };

const CASES: RuleCase[] = [
	{
		// Convention: AGENTS.md (Code) — no console logs, use the Logger domain service.
		rule: "lint/suspicious/noConsole",
		path: "src/shared/room/application/Notify.ts",
		red: 'export function notify(): void {\n\tconsole.log("joined");\n}\n',
		green:
			'import type { Logger } from "@shared/logger/domain/Logger";\n\nexport function notify(logger: Logger): void {\n\tlogger.info("joined");\n}\n',
	},
	{
		// Convention: AGENTS.md (Code) — `public`, `private` and `protected` are always explicit.
		rule: "lint/style/useConsistentMemberAccessibility",
		path: "src/shared/room/domain/Seat.ts",
		red: "export class Seat {\n\tposition(): number {\n\t\treturn 1;\n\t}\n}\n",
		green: "export class Seat {\n\tpublic position(): number {\n\t\treturn 1;\n\t}\n}\n",
	},
	{
		// Convention: AGENTS.md (Code) — `PascalCase` for classes.
		rule: "lint/style/useNamingConvention",
		path: "src/shared/room/domain/Seat.ts",
		red: "export class seat_list {}\n",
		green: "export class SeatList {}\n",
	},
	{
		// Convention: AGENTS.md (Code) — `camelCase` for variables.
		rule: "lint/style/useNamingConvention",
		path: "src/shared/room/domain/seat.ts",
		red: "export function count(): number {\n\tlet seat_count = 1;\n\tseat_count += 1;\n\treturn seat_count;\n}\n",
		green:
			"export function count(): number {\n\tlet seatCount = 1;\n\tseatCount += 1;\n\treturn seatCount;\n}\n",
	},
	{
		// Convention: docs/testing.md (Formatting & naming) — `it` names the behavior, no "should".
		rule: "plugin",
		path: "src/shared/room/domain/Seat.test.ts",
		red: 'it("should return the position", () => {\n\texpect(1).toBe(1);\n});\n',
		green: 'it("returns the position", () => {\n\texpect(1).toBe(1);\n});\n',
	},
	{
		// Convention: docs/testing.md (Formatting & naming) — no PR or requirement labels in test names.
		rule: "plugin",
		path: "src/shared/room/domain/Seat.test.ts",
		red: 'describe("seat (REQ-ROOM-1)", () => {\n\tit("returns the position", () => {\n\t\texpect(1).toBe(1);\n\t});\n});\n',
		green:
			'describe("Seat", () => {\n\tit("returns the position", () => {\n\t\texpect(1).toBe(1);\n\t});\n});\n',
	},
	{
		// Mined: string literal unions replaced string enums (src/presence/application/PresenceHub.ts).
		rule: "plugin",
		path: "src/shared/user-profile/domain/Role.ts",
		red: 'export enum Role {\n\tAdmin = "admin",\n\tPlayer = "player",\n}\n',
		green: 'export type Role = "admin" | "player";\n\nexport enum Opcode {\n\tJoin = 1,\n}\n',
	},
];

describe("lint rules", () => {
	it.each(CASES)("$rule reports a violation in $path", ({ rule, path, red }) => {
		const categories = lint({ [path]: red }).map(({ category }) => category);

		expect(categories).toContain(rule);
	});

	it.each(CASES)("$rule accepts code that follows it in $path", ({ rule, path, green }) => {
		const categories = lint({ [path]: green }).map(({ category }) => category);

		expect(categories).not.toContain(rule);
	});

	it("keeps every baseline file breaking its rule, so baselines only shrink", () => {
		const config = realConfig();
		const stale = config.overrides.flatMap((override, index) => {
			const baseline = override.includes.filter(isBaselineEntry).map((entry) => entry.slice(1));
			if (baseline.length === 0) {
				return [];
			}
			const category = categoryOf(override);
			const probe: BiomeConfig = {
				...config,
				overrides: config.overrides
					.filter((other, otherIndex) => otherIndex === index || !other.plugins)
					.map((other) =>
						other === override
							? { ...other, includes: other.includes.filter((entry) => !isBaselineEntry(entry)) }
							: other,
					),
			};
			const files = Object.fromEntries(
				baseline.map((path) => [path, readFileSync(join(ROOT, path), "utf8")]),
			);
			const breaking = new Set(
				lint(files, probe)
					.filter((diagnostic) => diagnostic.category === category)
					.map((diagnostic) => diagnostic.location.path),
			);

			return baseline.filter((path) => !breaking.has(path)).map((path) => `${category} ${path}`);
		});

		expect(stale).toEqual([]);
	});
});
