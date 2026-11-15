import {
	YGOProMsgAttack,
	YGOProMsgAttackDisabled,
	YGOProMsgAttack_CardLocation,
	YGOProMsgBattle,
	YGOProMsgBattle_CardLocation,
	YGOProMsgBattle_CardStats,
	YGOProMsgDamage,
	YGOProMsgDamageStepEnd,
	YGOProMsgDamageStepStart,
	YGOProMsgLpUpdate,
	YGOProMsgPayLpCost,
	YGOProMsgPosChange,
	YGOProMsgPosChange_CardLocation,
	YGOProMsgRecover,
	YGOProMsgSelectBattleCmd,
	YGOProMsgSelectBattleCmd_ActivatableInfo,
	YGOProMsgSelectBattleCmd_AttackableInfo,
	YGOProMsgWin,
} from "ygopro-msg-encode";

import { readActivatableCards, readLocation, type Decoder } from "./ignis-fields";
import type { IgnisReader } from "./IgnisReader";

function decodeWin(reader: IgnisReader): YGOProMsgWin {
	const message = new YGOProMsgWin();
	message.player = reader.u8();
	message.type = reader.u8();
	return message;
}

/** `[player:u8][amount:u32]`, shared by the four life point messages. */
function readPlayerAmount<K extends string, T extends { player: number } & Record<K, number>>(
	reader: IgnisReader,
	message: T,
	amountField: K,
): T {
	message.player = reader.u8();
	(message as Record<K, number>)[amountField] = reader.u32();
	return message;
}

function decodePosChange(reader: IgnisReader): YGOProMsgPosChange {
	const message = new YGOProMsgPosChange();
	message.code = reader.u32();
	message.card = new YGOProMsgPosChange_CardLocation();
	message.card.controller = reader.u8();
	message.card.location = reader.u8();
	message.card.sequence = reader.u8();
	message.previousPosition = reader.u8();
	message.currentPosition = reader.u8();
	return message;
}

/** A direct attack carries an all-zero defender location, as in YGOPro. */
function decodeAttack(reader: IgnisReader): YGOProMsgAttack {
	const message = new YGOProMsgAttack();
	message.attacker = readLocation(reader, new YGOProMsgAttack_CardLocation());
	message.defender = readLocation(reader, new YGOProMsgAttack_CardLocation());
	return message;
}

function decodeBattle(reader: IgnisReader): YGOProMsgBattle {
	const message = new YGOProMsgBattle();
	message.attacker = readBattleStats(reader);
	message.attackerBattleState = reader.u8();
	message.defender = readBattleStats(reader);
	message.defenderBattleState = reader.u8();
	return message;
}

function readBattleStats(reader: IgnisReader): YGOProMsgBattle_CardStats {
	const stats = new YGOProMsgBattle_CardStats();
	stats.location = readLocation(reader, new YGOProMsgBattle_CardLocation());
	stats.atk = reader.i32();
	stats.def = reader.i32();
	return stats;
}

function decodeSelectBattleCmd(reader: IgnisReader): YGOProMsgSelectBattleCmd {
	const message = new YGOProMsgSelectBattleCmd();
	message.player = reader.u8();
	message.activatableCards = readActivatableCards(
		reader,
		() => new YGOProMsgSelectBattleCmd_ActivatableInfo(),
	);
	message.activatableCount = message.activatableCards.length;
	message.attackableCards = [];
	const attackable = reader.u32();
	for (let i = 0; i < attackable; i++) {
		const card = new YGOProMsgSelectBattleCmd_AttackableInfo();
		card.code = reader.u32();
		card.controller = reader.u8();
		card.location = reader.u8();
		card.sequence = reader.u8();
		card.directAttack = reader.u8();
		message.attackableCards.push(card);
	}
	message.attackableCount = attackable;
	message.canM2 = reader.u8();
	message.canEp = reader.u8();
	return message;
}

/** The Battle Phase, life points and the end of the duel. */
export const BATTLE_DECODERS: Readonly<Record<number, Decoder>> = {
	5: decodeWin,
	10: decodeSelectBattleCmd,
	53: decodePosChange,
	91: (reader) => readPlayerAmount(reader, new YGOProMsgDamage(), "value"),
	92: (reader) => readPlayerAmount(reader, new YGOProMsgRecover(), "value"),
	94: (reader) => readPlayerAmount(reader, new YGOProMsgLpUpdate(), "lp"),
	100: (reader) => readPlayerAmount(reader, new YGOProMsgPayLpCost(), "cost"),
	110: decodeAttack,
	111: decodeBattle,
	112: () => new YGOProMsgAttackDisabled(),
	113: () => new YGOProMsgDamageStepStart(),
	114: () => new YGOProMsgDamageStepEnd(),
};
