import { CardTypes } from "./CardTypes";

export class Card {
	public readonly code: string;
	public readonly type: number;

	constructor({ code, type }: { code: string; type: number }) {
		this.code = code;
		this.type = type;
	}

	isExtraCard(): boolean {
		if ((this.type & (CardTypes.TYPE_FUSION | CardTypes.TYPE_SYNCHRO | CardTypes.TYPE_XYZ)) !== 0) {
			return true;
		}

		if ((this.type & CardTypes.TYPE_LINK) !== 0 && (this.type & CardTypes.TYPE_MONSTER) !== 0) {
			return true;
		}

		return false;
	}
}
