/**
 * EDOPro lobby duel flag constants.
 *
 * These values mirror the DUEL_MODE_MRx / DUEL_MODE_MRx_FORB defines from
 * the EDOPro client (gframe/ocgapi_constants.h).  The lobby uses them in
 * GetMasterRule() to decide what to show in the "Rule" column.
 */

// Individual flag bits (from ocgapi_constants.h)
const DUEL_OCG_OBSOLETE_IGNITION = 0x100;
const DUEL_1ST_TURN_DRAW         = 0x200;
const DUEL_1_FACEUP_FIELD        = 0x400;
const DUEL_PZONE                 = 0x800;
const DUEL_SEPARATE_PZONE        = 0x1000;
const DUEL_EMZONE                = 0x2000;
const DUEL_FSX_MMZONE            = 0x4000;
const DUEL_TRAP_MONSTERS_NOT_USE_ZONE = 0x8000;
const DUEL_RETURN_TO_DECK_TRIGGERS    = 0x10000;
const DUEL_TRIGGER_ONLY_IN_LOCATION   = 0x20000;
const DUEL_SPSUMMON_ONCE_OLD_NEGATE   = 0x40000;
const DUEL_CANNOT_SUMMON_OATH_OLD     = 0x80000;

// Composite duel mode flags
export const DUEL_MODE_MR1 =
  DUEL_OCG_OBSOLETE_IGNITION | DUEL_1ST_TURN_DRAW | DUEL_1_FACEUP_FIELD |
  DUEL_SPSUMMON_ONCE_OLD_NEGATE | DUEL_RETURN_TO_DECK_TRIGGERS | DUEL_CANNOT_SUMMON_OATH_OLD;

export const DUEL_MODE_MR2 =
  DUEL_1ST_TURN_DRAW | DUEL_1_FACEUP_FIELD |
  DUEL_SPSUMMON_ONCE_OLD_NEGATE | DUEL_RETURN_TO_DECK_TRIGGERS | DUEL_CANNOT_SUMMON_OATH_OLD;

export const DUEL_MODE_MR3 =
  DUEL_PZONE | DUEL_SEPARATE_PZONE |
  DUEL_SPSUMMON_ONCE_OLD_NEGATE | DUEL_RETURN_TO_DECK_TRIGGERS | DUEL_CANNOT_SUMMON_OATH_OLD;

export const DUEL_MODE_MR4 =
  DUEL_PZONE | DUEL_EMZONE |
  DUEL_SPSUMMON_ONCE_OLD_NEGATE | DUEL_RETURN_TO_DECK_TRIGGERS | DUEL_CANNOT_SUMMON_OATH_OLD;

export const DUEL_MODE_MR5 =
  DUEL_PZONE | DUEL_EMZONE | DUEL_FSX_MMZONE |
  DUEL_TRAP_MONSTERS_NOT_USE_ZONE | DUEL_TRIGGER_ONLY_IN_LOCATION;

// Forbidden card types per rule (TYPE_XYZ, TYPE_PENDULUM, TYPE_LINK)
const TYPE_XYZ      = 0x800000;
const TYPE_PENDULUM = 0x1000000;
const TYPE_LINK     = 0x4000000;

export const DUEL_MODE_MR1_FORB = TYPE_XYZ | TYPE_PENDULUM | TYPE_LINK;
export const DUEL_MODE_MR2_FORB = TYPE_PENDULUM | TYPE_LINK;
export const DUEL_MODE_MR3_FORB = TYPE_LINK;
export const DUEL_MODE_MR4_FORB = 0;
export const DUEL_MODE_MR5_FORB = 0;

interface LobbyDuelInfo {
  duelFlag: number;
  forbiddenTypes: number;
}

const DUEL_RULE_MAP: Record<number, LobbyDuelInfo> = {
  1: { duelFlag: DUEL_MODE_MR1, forbiddenTypes: DUEL_MODE_MR1_FORB },
  2: { duelFlag: DUEL_MODE_MR2, forbiddenTypes: DUEL_MODE_MR2_FORB },
  3: { duelFlag: DUEL_MODE_MR3, forbiddenTypes: DUEL_MODE_MR3_FORB },
  4: { duelFlag: DUEL_MODE_MR4, forbiddenTypes: DUEL_MODE_MR4_FORB },
  5: { duelFlag: DUEL_MODE_MR5, forbiddenTypes: DUEL_MODE_MR5_FORB },
};

/**
 * Given a Mercury duel_rule (1-5), returns the corresponding EDOPro lobby
 * duel_flag and forbidden_types so the client displays the correct rule
 * (e.g. "MR 5") instead of "Custom".
 */
export function getLobbyDuelInfo(duelRule: number): LobbyDuelInfo {
  return DUEL_RULE_MAP[duelRule] ?? { duelFlag: 0, forbiddenTypes: 0 };
}
