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

const KNOWN_ENGINE_LEAKS: readonly string[] = [
	"src/edopro/room/application/JoinHandler -> src/ygopro/room/domain/YGOProRoom",
	"src/edopro/room/application/JoinHandler -> src/ygopro/room/infrastructure/YGOProRoomList",
	"src/ygopro/deck/domain/YGOProDeckValidator -> src/edopro/ban-list/domain/BanList",
	"src/ygopro/messages/YGOProJoinGameMessage -> src/edopro/messages/Message",
	"src/ygopro/room/domain/YGOProRoom -> src/edopro/ban-list/infrastructure/BanListMemoryRepository",
];

const KNOWN_DOMAIN_LEAKS: readonly string[] = [
	"src/edopro/room/domain/Room -> src/edopro/ban-list/infrastructure/BanListMemoryRepository",
	"src/edopro/room/domain/Room -> src/edopro/card/infrastructure/sqlite/CardSQLiteTYpeORMRepository",
	"src/edopro/room/domain/Room -> src/edopro/deck/application/DeckCreator",
	"src/edopro/room/domain/Room -> src/edopro/room/application/CheckIfUserCanJoin",
	"src/edopro/room/domain/Room -> src/edopro/room/application/FinishDuelHandler",
	"src/edopro/room/domain/Room -> src/edopro/room/application/JoinToDuelAsSpectator",
	"src/edopro/room/domain/Room -> src/edopro/room/application/Reconnect",
	"src/edopro/room/domain/Room -> src/edopro/room/infrastructure/RoomList",
	"src/edopro/room/domain/Room -> src/shared/user-auth/application/UserAuth",
	"src/edopro/room/domain/Room -> src/shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository",
	"src/edopro/room/domain/states/chossing-order/ChossingOrderState -> src/edopro/room/application/JoinToDuelAsSpectator",
	"src/edopro/room/domain/states/chossing-order/ChossingOrderState -> src/edopro/room/application/Reconnect",
	"src/edopro/room/domain/states/chossing-order/ChossingOrderState -> src/shared/room/application/reconnect/ReconnectionTokenIssuer",
	"src/edopro/room/domain/states/chossing-order/ChossingOrderState -> src/shared/room/application/reconnect/logReconnectAttempt",
	"src/edopro/room/domain/states/dueling/DuelingState -> src/edopro/ban-list/infrastructure/BanListMemoryRepository",
	"src/edopro/room/domain/states/dueling/DuelingState -> src/edopro/deck/application/UpdateDeckMessageSizeCalculator",
	"src/edopro/room/domain/states/dueling/DuelingState -> src/edopro/room/application/FinishDuelHandler",
	"src/edopro/room/domain/states/dueling/DuelingState -> src/edopro/room/application/JoinToDuelAsSpectator",
	"src/edopro/room/domain/states/dueling/DuelingState -> src/edopro/room/application/Reconnect",
	"src/edopro/room/domain/states/dueling/DuelingState -> src/shared/room/application/reconnect/ReconnectionTokenIssuer",
	"src/edopro/room/domain/states/dueling/DuelingState -> src/shared/room/application/reconnect/logReconnectAttempt",
	"src/edopro/room/domain/states/rps/RockPaperScissorsState -> src/edopro/room/application/JoinToDuelAsSpectator",
	"src/edopro/room/domain/states/rps/RockPaperScissorsState -> src/edopro/room/application/Reconnect",
	"src/edopro/room/domain/states/rps/RockPaperScissorsState -> src/shared/room/application/reconnect/ReconnectionTokenIssuer",
	"src/edopro/room/domain/states/rps/RockPaperScissorsState -> src/shared/room/application/reconnect/logReconnectAttempt",
	"src/edopro/room/domain/states/side-decking/SideDeckingState -> src/edopro/deck/application/DeckCreator",
	"src/edopro/room/domain/states/side-decking/SideDeckingState -> src/edopro/deck/application/UpdateDeckMessageSizeCalculator",
	"src/edopro/room/domain/states/side-decking/SideDeckingState -> src/edopro/room/application/JoinToDuelAsSpectator",
	"src/edopro/room/domain/states/side-decking/SideDeckingState -> src/edopro/room/application/Reconnect",
	"src/edopro/room/domain/states/side-decking/SideDeckingState -> src/shared/room/application/reconnect/ReconnectionTokenIssuer",
	"src/edopro/room/domain/states/side-decking/SideDeckingState -> src/shared/room/application/reconnect/logReconnectAttempt",
	"src/edopro/room/domain/states/waiting/WaitingState -> src/edopro/deck/application/DeckCreator",
	"src/edopro/room/domain/states/waiting/WaitingState -> src/edopro/deck/application/UpdateDeckMessageSizeCalculator",
	"src/edopro/room/domain/states/waiting/WaitingState -> src/edopro/room/application/AuthenticatePlayer",
	"src/edopro/room/domain/states/waiting/WaitingState -> src/shared/room/application/reconnect/ReconnectionTokenIssuer",
	"src/edopro/room/domain/states/waiting/WaitingState -> src/shared/user-auth/application/UserAuth",
	"src/plugins/achievements/domain/laddersForBanList -> src/shared/rank/application/RankGroupResolver",
	"src/shared/room/domain/RoomState -> src/shared/room/application/lifecycle/MatchLifecycleHooks",
	"src/shared/room/domain/RoomState -> src/web-socket-server/WebSocketSingleton",
	"src/shared/socket/domain/TCPClientSocket -> net",
	"src/shared/socket/domain/WebSocketClientSocket -> ws",
	"src/ygopro/room/domain/RuleMappings -> src/shared/logger/infrastructure/LoggerFactory",
	"src/ygopro/room/domain/RuleMappings -> src/ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository",
	"src/ygopro/room/domain/YGOProRoom -> src/edopro/ban-list/infrastructure/BanListMemoryRepository",
	"src/ygopro/room/domain/YGOProRoom -> src/shared/user-auth/application/UserAuth",
	"src/ygopro/room/domain/YGOProRoom -> src/shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository",
	"src/ygopro/room/domain/YGOProRoom -> src/ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository",
	"src/ygopro/room/domain/YGOProRoom -> src/ygopro/card/infrastructure/CardYGOProRepository",
	"src/ygopro/room/domain/YGOProRoom -> src/ygopro/deck/application/YGOProDeckCreator",
	"src/ygopro/room/domain/YGOProRoom -> src/ygopro/room/admission/application/AdmitToRoom",
	"src/ygopro/room/domain/YGOProRoom -> src/ygopro/room/admission/application/CredentialResolver",
	"src/ygopro/room/domain/YGOProRoomState -> src/ygopro/room/application/AbandonBetweenDuels",
	"src/ygopro/room/domain/states/YGOProChoosingOrderState -> src/shared/room/application/reconnect/ReconnectionTokenIssuer",
	"src/ygopro/room/domain/states/YGOProChoosingOrderState -> src/shared/room/application/reconnect/logReconnectAttempt",
	"src/ygopro/room/domain/states/YGOProDuelingState -> src/shared/room/application/lifecycle/MatchLifecycleHooks",
	"src/ygopro/room/domain/states/YGOProDuelingState -> src/shared/room/application/reconnect/ReconnectionTokenIssuer",
	"src/ygopro/room/domain/states/YGOProDuelingState -> src/shared/room/application/reconnect/logReconnectAttempt",
	"src/ygopro/room/domain/states/YGOProDuelingState -> src/web-socket-server/WebSocketSingleton",
	"src/ygopro/room/domain/states/YGOProDuelingState -> src/ygopro/room/application/FinalizeYGOProRoom",
	"src/ygopro/room/domain/states/YGOProRockPaperScissorState -> src/shared/room/application/reconnect/ReconnectionTokenIssuer",
	"src/ygopro/room/domain/states/YGOProRockPaperScissorState -> src/shared/room/application/reconnect/logReconnectAttempt",
	"src/ygopro/room/domain/states/YGOProSideDeckingState -> src/shared/room/application/reconnect/ReconnectionTokenIssuer",
	"src/ygopro/room/domain/states/YGOProSideDeckingState -> src/shared/room/application/reconnect/logReconnectAttempt",
	"src/ygopro/room/domain/states/YGOProSideDeckingState -> src/ygopro/deck/application/YGOProDeckCreator",
	"src/ygopro/room/domain/states/YGOProSideDeckingState -> src/ygopro/room/application/AbandonBetweenDuels",
	"src/ygopro/room/domain/states/YGOProWaitingState -> src/shared/room/application/reconnect/ReconnectionTokenIssuer",
	"src/ygopro/room/domain/states/YGOProWaitingState -> src/ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository",
	"src/ygopro/room/domain/states/YGOProWaitingState -> src/ygopro/deck/application/YGOProDeckCreator",
	"src/ygopro/room/domain/states/YGOProWaitingState -> src/ygopro/room/admission/application/AdmitToRoom",
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
