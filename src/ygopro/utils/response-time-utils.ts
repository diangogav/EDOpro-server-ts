import { OcgcoreCommonConstants, YGOProMsgBase } from "ygopro-msg-encode";

export const getMessageIdentifier = (message: YGOProMsgBase): number =>
	((message.constructor as any).identifier as number) ?? 0;

export const canIncreaseTime = (gameMsg: number, response?: Buffer): boolean => {
	switch (gameMsg) {
		case OcgcoreCommonConstants.MSG_RETRY:
		case OcgcoreCommonConstants.MSG_SELECT_UNSELECT_CARD:
			return false;
		case OcgcoreCommonConstants.MSG_SELECT_CHAIN:
			return (
				response != null &&
				response.length >= 4 &&
				response.readInt32LE(0) !== -1
			);
		case OcgcoreCommonConstants.MSG_SELECT_IDLECMD: {
			if (response == null || response.length < 4) {
				return false;
			}
			const idleChoice = response.readInt32LE(0) & 0xffff;
			return idleChoice <= 5;
		}
		case OcgcoreCommonConstants.MSG_SELECT_BATTLECMD: {
			if (response == null || response.length < 4) {
				return false;
			}
			const battleChoice = response.readInt32LE(0) & 0xffff;
			return battleChoice <= 1;
		}
		default:
			return true;
	}
};
