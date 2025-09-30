import { Mode } from "./Mode.enum";

export type HostInfo = {
	mode: Mode;
	startLp: number;
	startHand: number;
	drawCount: number;
	timeLimit: number;
	rule: number;
	noCheck: boolean;
	noShuffle: boolean;
	lflist: number;
	duelRule: number;
	maxDeckPoints: number;
};
