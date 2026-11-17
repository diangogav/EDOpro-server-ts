import { mkdtemp, rm, utimes, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { PrereleaseIdsFile } from "./PrereleaseIdsFile";

const STRATEGY_SCORE = 101306092;
const STRATEGY_SCORE_IN_EDOPRO = 101402092;

describe("PrereleaseIdsFile", () => {
	let directory: string;
	let path: string;
	let writes = 0;

	/** Writes the file with a modification time later than the previous write. */
	const write = async (content: string): Promise<void> => {
		await writeFile(path, content);
		writes += 1;
		await utimes(path, new Date(), new Date(Date.now() + writes * 1000));
	};

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), "prerelease-ids-"));
		path = join(directory, "prerelease-ids.json");
	});

	afterEach(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	it("gives the EDOPro code of an unreleased card the file pairs", async () => {
		await write(
			JSON.stringify({ version: 1, ids: { [STRATEGY_SCORE]: STRATEGY_SCORE_IN_EDOPRO } }),
		);

		expect(await new PrereleaseIdsFile(path).counterpartOf(STRATEGY_SCORE)).toBe(
			STRATEGY_SCORE_IN_EDOPRO,
		);
	});

	it("gives nothing for a card the file does not pair", async () => {
		await write(
			JSON.stringify({ version: 1, ids: { [STRATEGY_SCORE]: STRATEGY_SCORE_IN_EDOPRO } }),
		);

		expect(await new PrereleaseIdsFile(path).counterpartOf(101307001)).toBeNull();
	});

	it("gives nothing when the file is missing", async () => {
		expect(await new PrereleaseIdsFile(path).counterpartOf(STRATEGY_SCORE)).toBeNull();
	});

	it("skips an entry that is not a pair of card codes", async () => {
		await write(JSON.stringify({ ids: { [STRATEGY_SCORE]: "101402092", abc: 5, 7: -1 } }));
		const file = new PrereleaseIdsFile(path);

		expect(await file.counterpartOf(STRATEGY_SCORE)).toBeNull();
		expect(await file.counterpartOf(7)).toBeNull();
	});

	it("reads the file again once it is replaced", async () => {
		await write(JSON.stringify({ ids: {} }));
		const file = new PrereleaseIdsFile(path);
		expect(await file.counterpartOf(STRATEGY_SCORE)).toBeNull();

		await write(JSON.stringify({ ids: { [STRATEGY_SCORE]: STRATEGY_SCORE_IN_EDOPRO } }));

		expect(await file.counterpartOf(STRATEGY_SCORE)).toBe(STRATEGY_SCORE_IN_EDOPRO);
	});

	it("keeps the pairs of the last good read when the file turns unreadable", async () => {
		await write(JSON.stringify({ ids: { [STRATEGY_SCORE]: STRATEGY_SCORE_IN_EDOPRO } }));
		const file = new PrereleaseIdsFile(path);
		await file.counterpartOf(STRATEGY_SCORE);

		await write("{ not json");

		expect(await file.counterpartOf(STRATEGY_SCORE)).toBe(STRATEGY_SCORE_IN_EDOPRO);
	});
});
