import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as ts from "typescript";

/**
 * Conventions of docs/testing.md that no installed linter can check.
 *
 * - Comments carry no PR or requirement labels (Biome cannot read comments;
 *   test names are covered by lint/biome-plugins/no-labels-in-test-names.grit).
 * - Test files live under `src/`: Jest only runs `src/`, so a test anywhere
 *   else would never run.
 */

const ROOT = resolve(__dirname, "../..");
const LABEL = /\b(PR-[0-9]+|REQ-[A-Z][A-Z0-9-]*)\b/;

/** The comments of a TypeScript file, read from its syntax tree so strings never count. */
function commentsOf(code: string): string[] {
	const file = ts.createSourceFile("file.ts", code, ts.ScriptTarget.Latest, true);
	const comments = new Map<number, string>();
	const visit = (node: ts.Node): void => {
		const ranges = [
			...(ts.getLeadingCommentRanges(code, node.pos) ?? []),
			...(ts.getTrailingCommentRanges(code, node.end) ?? []),
		];
		for (const range of ranges) {
			comments.set(range.pos, code.slice(range.pos, range.end));
		}
		node.getChildren(file).forEach(visit);
	};
	visit(file);

	return [...comments.values()];
}

function labelsInComments(code: string): string[] {
	return commentsOf(code).filter((comment) => LABEL.test(comment));
}

/** Tracked files of the repository that match the pathspecs. */
function repositoryFiles(...pathspecs: string[]): string[] {
	return execFileSync("git", ["ls-files", "--", ...pathspecs], { cwd: ROOT, encoding: "utf8" })
		.split("\n")
		.filter((path) => path !== "" && existsSync(join(ROOT, path)));
}

function testFilesOutsideSrc(paths: string[]): string[] {
	return paths.filter(
		(path) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) && !path.startsWith("src/"),
	);
}

describe("labelsInComments", () => {
	it("reports a label in a line or block comment", () => {
		expect(labelsInComments("// covers PR-42\nconst a = 1;\n/* see REQ-ROOM-7 */")).toHaveLength(2);
	});

	it("ignores labels inside strings and comments without labels", () => {
		expect(labelsInComments('// explains why\nconst id = "PR-42";')).toEqual([]);
	});
});

describe("testFilesOutsideSrc", () => {
	it("reports a test file outside src", () => {
		expect(testFilesOutsideSrc(["tests/room.test.ts", "src/room/Room.test.ts"])).toEqual([
			"tests/room.test.ts",
		]);
	});

	it("accepts test files under src and files that are not tests", () => {
		expect(testFilesOutsideSrc(["src/room/Room.test.ts", "scripts/build.ts"])).toEqual([]);
	});
});

describe("test conventions", () => {
	it("keeps PR and requirement labels out of comments", () => {
		const offenders = repositoryFiles("src/*.ts")
			.filter((path) => !path.startsWith("src/evolution-types/"))
			.filter((path) => {
				const code = readFileSync(join(ROOT, path), "utf8");

				return LABEL.test(code) && labelsInComments(code).length > 0;
			});

		expect(offenders).toEqual([]);
	});

	it("keeps every test file under src", () => {
		expect(testFilesOutsideSrc(repositoryFiles())).toEqual([]);
	});
});
