import { Commands } from "@shared/messages/Commands";

const SECRET_COMMANDS: ReadonlySet<number> = new Set([
	Commands.RECONNECT,
	Commands.MATCHMAKING_AUTH,
]);

// Wire framing: [u16 LE size][command][payload], where size counts the command
// byte plus the payload, so a whole frame spans size + 2 bytes.
const HEADER_SIZE = 2;
const COMMAND_OFFSET = 2;

// Hex dump of an inbound chunk for debug logs. A chunk may carry several
// frames, so every complete frame is inspected: those whose payload is a
// reconnection token or handshake ticket log only opcode and size. Trailing
// bytes that do not form a complete frame could hide such a frame, so they log
// only their length.
export const frameForLog = (data: Buffer): string => {
	const parts: string[] = [];
	let offset = 0;

	while (offset < data.length) {
		const remaining = data.length - offset;
		const frameLength =
			remaining >= HEADER_SIZE ? data.readUInt16LE(offset) + HEADER_SIZE : Infinity;

		if (frameLength > remaining || frameLength <= COMMAND_OFFSET) {
			parts.push(`<partial len=${remaining}>`);
			break;
		}

		const command = data.readUInt8(offset + COMMAND_OFFSET);
		const frame = data.subarray(offset, offset + frameLength);
		parts.push(
			SECRET_COMMANDS.has(command)
				? `<redacted 0x${command.toString(16)} len=${frameLength}>`
				: frame.toString("hex"),
		);
		offset += frameLength;
	}

	return parts.join(" ");
};
