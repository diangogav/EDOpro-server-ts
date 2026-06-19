import YGOProDeck from "ygopro-deck-encode";

import { DuelRecord } from "@ygopro/room/domain/DuelRecord";

interface DuelRecordMotherProps {
	seed: number[];
	players: { name: string; deck: YGOProDeck }[];
	isSwapped: boolean;
	winPosition: number | undefined;
	winReason: number | undefined;
	endTime: Date | undefined;
}

const emptyDeck = (): YGOProDeck => new YGOProDeck({ main: [], extra: [], side: [], name: "" });

export class DuelRecordMother {
	// Defaults to a resolved win for P0 so resolveObserverWinMsg() fires and the
	// record yields a playable stream. Pass winPosition/winReason as undefined to
	// model an abandoned match (no synthetic win frame).
	static create(overrides: Partial<DuelRecordMotherProps> = {}): DuelRecord {
		const record = new DuelRecord(
			overrides.seed ?? [1, 2, 3, 4],
			overrides.players ?? [
				{ name: "P1", deck: emptyDeck() },
				{ name: "P2", deck: emptyDeck() },
			],
			overrides.isSwapped ?? false,
		);

		record.winPosition = "winPosition" in overrides ? overrides.winPosition : 0;
		record.winReason = "winReason" in overrides ? overrides.winReason : 0;
		record.endTime = "endTime" in overrides ? overrides.endTime : new Date("2024-01-01T00:01:00Z");

		return record;
	}
}
