import { CardTypes } from "./CardTypes";

export enum ScopeCode {
	OCG = 0x1,
	TCG = 0x2,
	ANIME = 0x4,
	ILLEGAL = 0x8,
	VIDEO_GAME = 0x10,
	CUSTOM = 0x20,
	SPEED = 0x40,
	PRERELEASE = 0x100,
	RUSH = 0x200,
	LEGEND = 0x400,
	HIDDEN = 0x1000,
	OCG_TCG = OCG | TCG,
	OFFICIAL = OCG | TCG | PRERELEASE,
}
export class Card {
	public readonly alias: string;
	public readonly code: string;
	public readonly type: number;
	public readonly category: number;
	public readonly variant: number;

	constructor({
		alias,
		code,
		type,
		category,
		variant,
	}: {
		alias: string;
		code: string;
		type: number;
		category: number;
		variant: number;
	}) {
		this.alias = alias;
		this.code = code;
		this.type = type;
		this.category = category;
		this.variant = variant;
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

	isRitualMonster(): boolean {
		return (this.type & CardTypes.TYPE_RITUAL) !== 0 && (this.type & CardTypes.TYPE_MONSTER) !== 0;
	}
}
