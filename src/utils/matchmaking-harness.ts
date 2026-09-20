/**
 * Raw TCP client for the matchmaking opcodes, for manual checks against a
 * running server without a game client.
 *
 * It performs the entry sequence a real client performs — PLAYER_INFO, AUTH
 * with a game ticket, then ENTER once the server reports the session
 * authenticated — and prints every matchmaking frame it receives until the
 * match is found, the entry is rejected or the timeout elapses.
 *
 * Usage:
 *   pnpm matchmaking:harness --ticket <uuid> --name <display-name> [options]
 *
 * Options:
 *   --host <host>          default 127.0.0.1
 *   --port <port>          default 7711 (Mercury TCP)
 *   --format <name>        tcg | jtp | edison, default tcg
 *   --timeout <ms>         give up and exit non-zero, default 60000
 *   --cancel-after <ms>    send CANCEL after entering the queue
 *
 * A ticket is single-use and issued by the API. Seed one by hand with:
 *   docker exec <redis-container> redis-cli SET ticket:<uuid> <userId> EX 900
 */
import { Socket } from "net";

import { Commands } from "../shared/messages/Commands";
import { mercuryConfig } from "../ygopro/config";
import { MatchmakingStatusState } from "../ygopro/matchmaking/domain/ParticipantChannel";
import { MatchmakingFormat } from "../ygopro/matchmaking/domain/QueueEntry";
import {
	MATCHMAKING_AUTH,
	MATCHMAKING_CANCEL,
	MATCHMAKING_ENTER,
	MATCHMAKING_FOUND,
	MATCHMAKING_STATUS,
	MAX_TICKET_BYTES,
	OPPONENT_TYPE_TO_CODE,
	REASON_TO_CODE,
	STATE_TO_CODE,
} from "../ygopro/matchmaking/protocol/matchmaking-protocol";

/** CTOS_PLAYER_INFO carries a fixed 40-byte UTF-16LE name field. */
const PLAYER_INFO_NAME_BYTES = 40;
/** Ranked is the only mode the queue accepts today. */
const RANKED_MODE = 0;
const FORMAT_TO_CODE: Readonly<Record<MatchmakingFormat, number>> = Object.freeze({
	tcg: 0,
	jtp: 1,
	edison: 2,
});

const STATE_BY_CODE = invert(STATE_TO_CODE);
const REASON_BY_CODE = invert(REASON_TO_CODE);
const OPPONENT_TYPE_BY_CODE = invert(OPPONENT_TYPE_TO_CODE);

function invert(table: Readonly<Record<string, number>>): ReadonlyMap<number, string> {
	return new Map(Object.entries(table).map(([name, code]) => [code, name]));
}

function frame(opcode: number, body: Buffer): Buffer {
	const size = 1 + body.length;
	const out = Buffer.alloc(2 + size);
	out.writeUInt16LE(size, 0);
	out.writeUInt8(opcode, 2);
	body.copy(out, 3);

	return out;
}

function playerInfoFrame(name: string): Buffer {
	const body = Buffer.alloc(PLAYER_INFO_NAME_BYTES);
	body.write(name, 0, "utf16le");

	return frame(Commands.PLAYER_INFO, body);
}

function authFrame(ticket: string): Buffer {
	const ticketBytes = Buffer.from(ticket, "utf8");
	const body = Buffer.alloc(1 + ticketBytes.length);
	body.writeUInt8(ticketBytes.length, 0);
	ticketBytes.copy(body, 1);

	return frame(MATCHMAKING_AUTH, body);
}

function enterFrame(format: MatchmakingFormat): Buffer {
	const body = Buffer.alloc(4);
	body.writeUInt8(FORMAT_TO_CODE[format], 0);
	body.writeUInt8(RANKED_MODE, 1);
	body.writeUInt16LE(mercuryConfig.version, 2);

	return frame(MATCHMAKING_ENTER, body);
}

interface Options {
	host: string;
	port: number;
	name: string;
	ticket: string;
	format: MatchmakingFormat;
	timeoutMs: number;
	cancelAfterMs: number | null;
}

function parseOptions(argv: readonly string[]): Options {
	const flags = new Map<string, string>();
	for (let i = 0; i < argv.length; i += 2) {
		const flag = argv[i];
		const value = argv[i + 1];
		if (flag?.startsWith("--") && value !== undefined) {
			flags.set(flag.slice(2), value);
		}
	}

	const ticket = flags.get("ticket");
	const name = flags.get("name");
	if (ticket === undefined || name === undefined) {
		throw new Error("--ticket and --name are required");
	}
	if (Buffer.byteLength(ticket, "utf8") > MAX_TICKET_BYTES) {
		throw new Error(`--ticket exceeds ${MAX_TICKET_BYTES} bytes`);
	}

	const format = (flags.get("format") ?? "tcg") as MatchmakingFormat;
	if (!(format in FORMAT_TO_CODE)) {
		throw new Error(`--format must be one of ${Object.keys(FORMAT_TO_CODE).join(", ")}`);
	}

	const cancelAfter = flags.get("cancel-after");

	return {
		host: flags.get("host") ?? "127.0.0.1",
		port: Number(flags.get("port") ?? 7711),
		name,
		ticket,
		format,
		timeoutMs: Number(flags.get("timeout") ?? 60_000),
		cancelAfterMs: cancelAfter !== undefined ? Number(cancelAfter) : null,
	};
}

interface WireFrame {
	readonly opcode: number;
	readonly body: Buffer;
}

/** Pulls whole `[size:u16 LE][opcode:u8][body]` frames out of the read buffer,
 *  reporting how many bytes of it they used so the rest waits for more data. */
export function takeFrames(buffer: Buffer): { frames: WireFrame[]; consumed: number } {
	const taken: WireFrame[] = [];
	let offset = 0;
	while (buffer.length - offset >= 2) {
		const size = buffer.readUInt16LE(offset);
		if (size < 1 || buffer.length - offset < 2 + size) {
			break;
		}
		taken.push({
			opcode: buffer.readUInt8(offset + 2),
			body: buffer.subarray(offset + 3, offset + 2 + size),
		});
		offset += 2 + size;
	}

	return { frames: taken, consumed: offset };
}

export function describeStatus(body: Buffer): {
	state: string;
	waitedMs: number;
	reason: string;
} {
	if (body.length !== 6) {
		return { state: `malformed(${body.length}B)`, waitedMs: 0, reason: "none" };
	}

	return {
		state: STATE_BY_CODE.get(body.readUInt8(0)) ?? `unknown(${body.readUInt8(0)})`,
		waitedMs: body.readUInt32LE(1),
		reason: REASON_BY_CODE.get(body.readUInt8(5)) ?? `unknown(${body.readUInt8(5)})`,
	};
}

export function describeFound(body: Buffer): Record<string, unknown> {
	if (body.length < 5) {
		return { malformed: `${body.length}B` };
	}
	const matchIdLength = body.readUInt8(4);
	const nameOffset = 5 + matchIdLength;
	const nameLength = body.length > nameOffset ? body.readUInt8(nameOffset) : 0;

	return {
		opponentType: OPPONENT_TYPE_BY_CODE.get(body.readUInt8(0)) ?? `unknown(${body.readUInt8(0)})`,
		rated: body.readUInt8(1) === 1,
		roomId: body.readUInt16LE(2),
		matchId: body.subarray(5, nameOffset).toString("utf8"),
		opponentName: body.subarray(nameOffset + 1, nameOffset + 1 + nameLength).toString("utf8"),
	};
}

function run(options: Options): void {
	const socket = new Socket();
	let pending = Buffer.alloc(0);
	let entered = false;
	let exitCode = 1;

	const stop = (code: number): void => {
		exitCode = code;
		socket.end();
	};

	const timeout = setTimeout(() => {
		console.log(`[harness] timed out after ${options.timeoutMs}ms`);
		stop(1);
	}, options.timeoutMs);

	socket.connect(options.port, options.host, () => {
		console.log(`[harness] connected to ${options.host}:${options.port} as "${options.name}"`);
		socket.write(playerInfoFrame(options.name));
		socket.write(authFrame(options.ticket));
		console.log("[harness] sent PLAYER_INFO and AUTH");
	});

	socket.on("data", (chunk) => {
		pending = Buffer.concat([pending, chunk]);
		const { frames, consumed } = takeFrames(pending);
		pending = pending.subarray(consumed);
		for (const message of frames) {
			handle(message.opcode, message.body);
		}
	});

	const handle = (opcode: number, body: Buffer): void => {
		if (opcode === MATCHMAKING_STATUS) {
			const status = describeStatus(body);
			console.log(
				`[harness] STATUS ${status.state} waited=${status.waitedMs}ms reason=${status.reason}`,
			);
			if (status.state === ("authenticated" satisfies MatchmakingStatusState) && !entered) {
				entered = true;
				socket.write(enterFrame(options.format));
				console.log(
					`[harness] sent ENTER format=${options.format} version=${mercuryConfig.version}`,
				);
				if (options.cancelAfterMs !== null) {
					setTimeout(() => {
						socket.write(frame(MATCHMAKING_CANCEL, Buffer.alloc(0)));
						console.log("[harness] sent CANCEL");
					}, options.cancelAfterMs);
				}
			}
			const terminal: readonly string[] = [
				"cancelled" satisfies MatchmakingStatusState,
				"rejected" satisfies MatchmakingStatusState,
				"replaced" satisfies MatchmakingStatusState,
			];
			if (terminal.includes(status.state)) {
				stop(status.state === ("rejected" satisfies MatchmakingStatusState) ? 1 : 0);
			}

			return;
		}

		if (opcode === MATCHMAKING_FOUND) {
			console.log("[harness] FOUND", describeFound(body));
			// The server seats this same socket in the room right after, so keep
			// reading briefly to show the room frames that follow.
			setTimeout(() => stop(0), 2_000);

			return;
		}

		console.log(`[harness] STOC 0x${opcode.toString(16)} (${body.length}B)`);
	};

	socket.on("error", (error) => {
		console.error("[harness] socket error", error.message);
		stop(1);
	});

	socket.on("close", () => {
		clearTimeout(timeout);
		console.log("[harness] socket closed");
		process.exit(exitCode);
	});

	process.on("SIGINT", () => {
		if (entered) {
			socket.write(frame(MATCHMAKING_CANCEL, Buffer.alloc(0)));
			console.log("[harness] sent CANCEL");
		}
		stop(0);
	});
}

// Guarded so the decoders above can be imported by tests without the CLI
// opening a socket.
if (require.main === module) {
	try {
		run(parseOptions(process.argv.slice(2)));
	} catch (error) {
		console.error(`[harness] ${(error as Error).message}`);
		process.exit(1);
	}
}
