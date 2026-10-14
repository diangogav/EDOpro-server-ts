/** Negotiated STOC extension: [size:u16 LE][0xf2][version=1][public instance key:16 ASCII]. */
export const LOBBY_METADATA = 0xf2;

export function lobbyMetadata(inviteId: string): Buffer {
	if (!/^[A-Za-z0-9_-]{16}$/.test(inviteId)) {
		throw new Error("Invalid lobby instance identity");
	}
	const frame = Buffer.alloc(20);
	frame.writeUInt16LE(18, 0);
	frame[2] = LOBBY_METADATA;
	frame[3] = 1;
	frame.write(inviteId, 4, 16, "ascii");
	return frame;
}
