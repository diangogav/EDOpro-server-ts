// STOC notice about a player who walked away between duels (RPS, choosing order,
// side decking). Wire format: [2b size LE][0xf6][kind][payload].
//   kind 0x00 OPPONENT_DISCONNECTED, payload: grace seconds as u16 LE
//   kind 0x01 OPPONENT_RECONNECTED
//   kind 0x02 MATCH_CANCELLED — no duel was played, nothing is recorded
//   kind 0x03 MATCH_WON — the receiver wins the match by abandon
// The terminal kinds are followed by the room teardown (STOC_DUEL_END + close).
const MATCH_ABANDON = 0xf6;

export class MatchAbandonClientMessage {
	static opponentDisconnected(graceSeconds: number): Buffer {
		const seconds = Buffer.alloc(2);
		seconds.writeUint16LE(graceSeconds);

		return this.build(0x00, seconds);
	}

	static opponentReconnected(): Buffer {
		return this.build(0x01);
	}

	static matchCancelled(): Buffer {
		return this.build(0x02);
	}

	static matchWon(): Buffer {
		return this.build(0x03);
	}

	private static build(kind: number, payload: Buffer = Buffer.alloc(0)): Buffer {
		const data = Buffer.concat([Buffer.from([MATCH_ABANDON, kind]), payload]);
		const size = Buffer.alloc(2);
		size.writeUint16LE(data.length);

		return Buffer.concat([size, data]);
	}
}
