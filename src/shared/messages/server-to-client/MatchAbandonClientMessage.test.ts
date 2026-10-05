import { MatchAbandonClientMessage } from "./MatchAbandonClientMessage";

// Pins the abandon notice wire format: [2b size LE][0xf6][kind][payload].
describe("MatchAbandonClientMessage", () => {
	it("announces the opponent disconnected with the grace seconds as u16 LE", () => {
		expect(MatchAbandonClientMessage.opponentDisconnected(60).toString("hex")).toBe("0400f6003c00");
	});

	it("announces the opponent reconnected", () => {
		expect(MatchAbandonClientMessage.opponentReconnected().toString("hex")).toBe("0200f601");
	});

	it("announces the match was cancelled with no result", () => {
		expect(MatchAbandonClientMessage.matchCancelled().toString("hex")).toBe("0200f602");
	});

	it("announces the receiver won the match by abandon", () => {
		expect(MatchAbandonClientMessage.matchWon().toString("hex")).toBe("0200f603");
	});
});
