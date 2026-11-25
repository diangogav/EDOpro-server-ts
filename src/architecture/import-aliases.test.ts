import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * Imports from another module use its path alias (AGENTS.md, Path aliases):
 * `@shared/room/domain/Room`, never `../../shared/room/domain/Room` or
 * `src/shared/room/domain/Room`. Imports inside the same module stay free.
 *
 * Biome reads the specifier only, and this rule needs the resolved target, so
 * it runs as a test. `KNOWN_UNALIASED_IMPORTERS` lists the files that broke the
 * rule when it was added. It only shrinks: a new file fails the test, and so
 * does a listed file that no longer breaks the rule. Fix the imports of a
 * file, then delete its line.
 */

const ROOT = resolve(__dirname, "../..");

const ALIASED_MODULES: Record<string, string> = {
	"src/edopro/": "@edopro/",
	"src/shared/": "@shared/",
	"src/ygopro/": "@ygopro/",
	"src/plugins/": "@plugins/",
	"src/test-support/": "@test-support/",
};

const KNOWN_UNALIASED_IMPORTERS: readonly string[] = [
	"src/bootstrap/loadedBanListNamesProvider.test.ts",
	"src/config/index.ts",
	"src/edopro/RoomMessageEmitter.ts",
	"src/edopro/ban-list/domain/BanList.ts",
	"src/edopro/ban-list/infrastructure/BanListLoader.ts",
	"src/edopro/ban-list/infrastructure/BanListMemoryRepository.ts",
	"src/edopro/card/infrastructure/sqlite/CardSQLiteTYpeORMRepository.ts",
	"src/edopro/client/domain/Client.ts",
	"src/edopro/deck/application/DeckCreator.ts",
	"src/edopro/messages/client-to-server/CreateGameMessage.ts",
	"src/edopro/messages/client-to-server/JoinGameMessage.ts",
	"src/edopro/room/application/CheckIfUserCanJoin.ts",
	"src/edopro/room/application/EdoproSpeedDuelRooms.ts",
	"src/edopro/room/application/FinishDuelHandler.ts",
	"src/edopro/room/application/GameCreatorHandler.ts",
	"src/edopro/room/application/JoinHandler.ts",
	"src/edopro/room/application/JoinToDuelAsSpectator.ts",
	"src/edopro/room/application/Reconnect.ts",
	"src/edopro/room/domain/EdoproRoomState.test.ts",
	"src/edopro/room/domain/EdoproRoomState.ts",
	"src/edopro/room/domain/EdoproRoomStateProcessDuelMessage.test.ts",
	"src/edopro/room/domain/Room.ts",
	"src/edopro/room/domain/RoomClientNotifier.ts",
	"src/edopro/room/domain/SpeedDuelRoomPreset.ts",
	"src/edopro/room/domain/states/chossing-order/ChossingOrderState.ts",
	"src/edopro/room/domain/states/dueling/DuelingState.ts",
	"src/edopro/room/domain/states/rps/RockPaperScissorsState.ts",
	"src/edopro/room/domain/states/rps/RpsChoiceCommandStrategy.ts",
	"src/edopro/room/domain/states/side-decking/SideDeckingState.ts",
	"src/edopro/room/domain/states/waiting/WaitingState.ts",
	"src/edopro/room/match/domain/Match.ts",
	"src/http-server/Server.ts",
	"src/http-server/controllers/GetResourceVersionController.ts",
	"src/http-server/controllers/GetRoomListController.ts",
	"src/http-server/controllers/RoomListController.ts",
	"src/http-server/controllers/ServerMessagesController.test.ts",
	"src/http-server/controllers/ServerMessagesController.ts",
	"src/http-server/routes/index.ts",
	"src/index.ts",
	"src/plugins/basic-stats/application/BasicStatsCalculator.ts",
	"src/plugins/elo-rating/application/EloRatingCalculator.ts",
	"src/plugins/unranked-match/application/UnrankedMatchSaver.test.ts",
	"src/plugins/unranked-match/application/UnrankedMatchSaver.ts",
	"src/scripts/backfill-achievements.test.ts",
	"src/scripts/backfill-achievements.ts",
	"src/scripts/backfill-group-window.ts",
	"src/scripts/backfill-points-ledger.test.ts",
	"src/scripts/backfill-points-ledger.ts",
	"src/socket-server/HandshakeTicketAuthenticator.ts",
	"src/socket-server/HostServer.ts",
	"src/socket-server/SocketConnectionHandler.ts",
	"src/socket-server/WSHostServer.ts",
	"src/socket-server/WSYGOProServer.test.ts",
	"src/socket-server/WSYGOProServer.ts",
	"src/socket-server/YGOProReconnectRoute.ts",
	"src/socket-server/YGOProServer.ts",
	"src/utils/create-user.ts",
	"src/utils/matchmaking-harness.test.ts",
	"src/utils/matchmaking-harness.ts",
	"src/utils/migrate-user-from-redis-to-postgres.ts",
	"src/web-socket-server/WebSocketSingleton.ts",
	"src/ygopro/SimpleRoomMessageEmitter.ts",
	"src/ygopro/ban-list/domain/YGOProBanList.ts",
	"src/ygopro/ban-list/infrastructure/YGOProBanListLoader.ts",
	"src/ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository.test.ts",
	"src/ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository.ts",
	"src/ygopro/card/infrastructure/YGOProCardSearchRepository.ts",
	"src/ygopro/client/domain/YGOProClient.ts",
	"src/ygopro/matchmaking/protocol/matchmaking-protocol.test.ts",
	"src/ygopro/messages/YGOProJoinGameMessage.ts",
	"src/ygopro/ocgcore-worker/ocgcore.ts",
	"src/ygopro/room/domain/RuleMappings.test.ts",
	"src/ygopro/room/domain/YGOProRoomState.test.ts",
	"src/ygopro/room/domain/resolveJoinerIdentityWithTimeout.ts",
	"src/ygopro/room/domain/states/YGOProChoosingOrderState.ts",
	"src/ygopro/room/domain/states/YGOProRockPaperScissorState.ts",
	"src/ygopro/room/domain/states/YGOProSideDeckingState.ts",
	"src/ygopro/ygopro/PoolSelection.test.ts",
	"src/ygopro/ygopro/PoolSelection.ts",
	"src/ygopro/ygopro/ResourcePoolResolver.integration.test.ts",
	"src/ygopro/ygopro/ResourcePoolResolver.test.ts",
	"src/ygopro/ygopro/ResourcePoolResolver.ts",
	"src/ygopro/ygopro/YGOProResourceLoader.ts",
];

const SPECIFIER_PATTERNS = [
	/(?:import|export)\s[^'";]*?from\s*["']([^"']+)["']/g,
	/import\s*["']([^"']+)["']/g,
	/import\(\s*["']([^"']+)["']\s*\)/g,
	/require\(\s*["']([^"']+)["']\s*\)/g,
];

const moduleOf = (path: string): string | undefined =>
	Object.keys(ALIASED_MODULES).find((root) => path.startsWith(root));

/** The imports of `file` that reach another aliased module without its alias. */
function unaliasedImports(file: string, code: string): string[] {
	const own = moduleOf(file);

	return SPECIFIER_PATTERNS.flatMap((pattern) =>
		[...code.matchAll(pattern)].map((match) => match[1]),
	).filter((specifier) => {
		if (!specifier.startsWith(".") && !specifier.startsWith("src/")) {
			return false;
		}
		const target = specifier.startsWith(".")
			? relative(ROOT, resolve(ROOT, dirname(file), specifier))
			: specifier;
		const module = moduleOf(`${target}/`);

		return module !== undefined && module !== own;
	});
}

function sourceFiles(): string[] {
	return execFileSync("git", ["ls-files", "--", "src/*.ts"], { cwd: ROOT, encoding: "utf8" })
		.split("\n")
		.filter(
			(path) =>
				path !== "" &&
				!path.startsWith("src/evolution-types/") &&
				!path.endsWith(".d.ts") &&
				existsSync(join(ROOT, path)),
		);
}

describe("unaliasedImports", () => {
	it("reports relative and src/ imports into another module", () => {
		const code = [
			'import { Room } from "../../../shared/room/domain/Room";',
			'import { Client } from "src/edopro/client/domain/Client";',
		].join("\n");

		expect(unaliasedImports("src/ygopro/room/domain/Seat.ts", code)).toEqual([
			"../../../shared/room/domain/Room",
			"src/edopro/client/domain/Client",
		]);
	});

	it("accepts aliases, imports inside the same module and packages", () => {
		const code = [
			'import { Room } from "@shared/room/domain/Room";',
			'import { Seat } from "../domain/Seat";',
			'import { WebSocket } from "ws";',
		].join("\n");

		expect(unaliasedImports("src/ygopro/room/application/Join.ts", code)).toEqual([]);
	});
});

describe("import aliases", () => {
	it("imports other modules through their alias, and the known list only shrinks", () => {
		const importers = sourceFiles().filter(
			(file) => unaliasedImports(file, readFileSync(join(ROOT, file), "utf8")).length > 0,
		);
		const added = importers.filter((file) => !KNOWN_UNALIASED_IMPORTERS.includes(file));
		const fixed = KNOWN_UNALIASED_IMPORTERS.filter((file) => !importers.includes(file));

		expect({ added, fixed }).toEqual({ added: [], fixed: [] });
	});
});
