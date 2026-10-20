import { Commands } from "@shared/messages/Commands";

const SECRET_COMMANDS: ReadonlySet<number> = new Set([
	Commands.RECONNECT,
	Commands.MATCHMAKING_AUTH,
]);

// Hex dump of an inbound frame for debug logs, except for the commands whose
// payload is a reconnection token or handshake ticket: those log only the
// opcode and size.
export const frameForLog = (data: Buffer): string => {
	if (data.length >= 3 && SECRET_COMMANDS.has(data.readUInt8(2))) {
		return `<redacted 0x${data.readUInt8(2).toString(16)} len=${data.length}>`;
	}

	return data.toString("hex");
};
