export class MercuryServerToClientMessages {
	private static readonly commands: { [key: number]: string } = {
		1: "GAME_MSG",
		2: "ERROR_MSG",
		3: "SELECT_HAND",
		4: "SELECT_TP",
		5: "HAND_RESULT",
		6: "TP_RESULT",
		7: "CHANGE_SIDE",
		8: "WAITING_SIDE",
		9: "DECK_COUNT",
		17: "CREATE_GAME",
		18: "JOIN_GAME",
		19: "TYPE_CHANGE",
		20: "LEAVE_GAME",
		21: "DUEL_START",
		22: "DUEL_END",
		23: "REPLAY",
		24: "TIME_LIMIT",
		25: "CHAT",
		32: "HS_PLAYER_ENTER",
		33: "HS_PLAYER_CHANGE",
		34: "HS_WATCH_CHANGE",
		48: "FIELD_FINISH",
	};

	public static get(number: number): string | null {
		return this.commands[number];
	}
}
