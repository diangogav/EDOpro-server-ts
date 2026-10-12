import { mock, MockProxy } from "jest-mock-extended";

import { AchievementCatalog } from "../plugins/achievements/domain/AchievementCatalog";
import { MatchHistoryReplaySource } from "../plugins/achievements/domain/MatchHistoryReplaySource";
import { ReplayedMatch } from "../plugins/achievements/domain/replayAchievements";
import {
	UserAchievementRepository,
	UserAchievementTransaction,
} from "../plugins/achievements/domain/UserAchievementRepository";
import { BackfillAchievementsDependencies, runBackfill } from "./backfill-achievements";

const CATALOG: Record<string, number> = {
	first_win: 1001,
	streak_3: 1005,
	"format_first_win:TCG": 1011,
};

const win = (season = 1): ReplayedMatch => ({ won: true, banListName: "TCG", season });

describe("runBackfill (achievements)", () => {
	let source: MockProxy<MatchHistoryReplaySource>;
	let catalog: MockProxy<AchievementCatalog>;
	let repository: MockProxy<UserAchievementRepository>;
	let tx: MockProxy<UserAchievementTransaction>;
	let histories: Record<string, ReplayedMatch[]>;
	let knownUserIds: string[];
	let deps: BackfillAchievementsDependencies;

	beforeEach(() => {
		source = mock<MatchHistoryReplaySource>();
		catalog = mock<AchievementCatalog>();
		repository = mock<UserAchievementRepository>();
		tx = mock<UserAchievementTransaction>();
		histories = { "user-1": [win(2), win(2), win(3)] };
		knownUserIds = ["user-1"];

		source.userIdsWithMatches.mockImplementation(() => Promise.resolve(Object.keys(histories)));
		source.historyFor.mockImplementation((userId) => Promise.resolve(histories[userId]));
		catalog.findByCodes.mockImplementation((codes) =>
			Promise.resolve(
				codes.filter((code) => code in CATALOG).map((code) => ({ id: CATALOG[code], code })),
			),
		);
		tx.heldAchievementIds.mockResolvedValue(new Set());
		repository.transaction.mockImplementation((_userId, work) => work(tx) as never);

		deps = {
			source,
			knownUserIds: { fetchRows: () => Promise.resolve(knownUserIds.map((id) => ({ id }))) },
			catalog,
			userAchievements: repository,
			laddersFor: (banListName) => (banListName === "TCG" ? ["TCG"] : []),
			logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
		};
	});

	it("awards the replayed codes with their first-reached season and labels", async () => {
		const summary = await runBackfill(deps, { dryRun: false });

		expect(tx.award).toHaveBeenCalledWith({
			userId: "user-1",
			achievementId: 1001,
			season: 2,
			labels: [],
		});
		expect(tx.award).toHaveBeenCalledWith({
			userId: "user-1",
			achievementId: 1005,
			season: 3,
			labels: [],
		});
		expect(tx.award).toHaveBeenCalledWith({
			userId: "user-1",
			achievementId: 1011,
			season: 2,
			labels: ["TCG"],
		});
		expect(summary).toMatchObject({
			usersScanned: 1,
			usersSkipped: 0,
			awardsPlanned: 3,
			awardsInserted: 3,
		});
	});

	it("inserts nothing and opens no transaction in dry-run mode", async () => {
		const summary = await runBackfill(deps, { dryRun: true });

		expect(repository.transaction).not.toHaveBeenCalled();
		expect(tx.award).not.toHaveBeenCalled();
		expect(summary).toMatchObject({ awardsPlanned: 3, awardsInserted: 0 });
		expect(deps.logger.info).toHaveBeenCalledWith(expect.stringContaining("DRY RUN"));
	});

	it("awards only the codes the user does not hold yet", async () => {
		tx.heldAchievementIds.mockResolvedValue(new Set([1001, 1011]));

		const summary = await runBackfill(deps, { dryRun: false });

		expect(tx.award).toHaveBeenCalledTimes(1);
		expect(tx.award).toHaveBeenCalledWith(expect.objectContaining({ achievementId: 1005 }));
		expect(summary).toMatchObject({ awardsPlanned: 3, awardsInserted: 1 });
	});

	it("skips users missing from the users table without reading their history", async () => {
		histories = { "user-1": [win()], ghost: [win()] };

		const summary = await runBackfill(deps, { dryRun: false });

		expect(source.historyFor).not.toHaveBeenCalledWith("ghost");
		expect(repository.transaction).not.toHaveBeenCalledWith("ghost", expect.anything());
		expect(summary).toMatchObject({ usersScanned: 2, usersSkipped: 1 });
	});

	it("ignores a ladder code without a catalog row silently", async () => {
		catalog.findByCodes.mockImplementation((codes) =>
			Promise.resolve(
				codes.filter((code) => code === "first_win").map((code) => ({ id: 1001, code })),
			),
		);

		const summary = await runBackfill(deps, { dryRun: false });

		expect(deps.logger.warn).not.toHaveBeenCalledWith(expect.stringContaining("format_first_win"));
		expect(summary.unknownCodes).not.toContain("format_first_win:TCG");
	});

	it("reports a code absent from the catalog exactly once across users", async () => {
		histories = {
			"user-1": [win(), win(), win()],
			"user-2": [win(), win(), win()],
		};
		knownUserIds = ["user-1", "user-2"];
		catalog.findByCodes.mockImplementation((codes) =>
			Promise.resolve(
				codes.filter((code) => code === "first_win").map((code) => ({ id: 1001, code })),
			),
		);

		const summary = await runBackfill(deps, { dryRun: false });

		const warnings = (deps.logger.warn as jest.Mock).mock.calls.map(([message]) => String(message));
		expect(warnings.filter((message) => message.includes("streak_3"))).toHaveLength(1);
		expect(summary.unknownCodes).toEqual(["streak_3"]);
	});
});
