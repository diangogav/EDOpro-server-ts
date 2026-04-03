import { _OcgcoreConstants } from 'koishipro-core.js';

const { OcgcoreScriptConstants } = _OcgcoreConstants;

export function splitRefreshLocations(location: number) {
  const bits = [
    OcgcoreScriptConstants.LOCATION_MZONE,
    OcgcoreScriptConstants.LOCATION_SZONE,
    OcgcoreScriptConstants.LOCATION_HAND,
    OcgcoreScriptConstants.LOCATION_GRAVE,
    OcgcoreScriptConstants.LOCATION_REMOVED,
    OcgcoreScriptConstants.LOCATION_EXTRA,
    OcgcoreScriptConstants.LOCATION_DECK,
    OcgcoreScriptConstants.LOCATION_OVERLAY,
    OcgcoreScriptConstants.LOCATION_FZONE,
    OcgcoreScriptConstants.LOCATION_PZONE,
  ];
  const locations = bits.filter((bit) => (location & bit) !== 0);
  if (locations.length > 0) {
    return locations;
  }
  return [location];
}

export function getZoneQueryFlag(location: number) {
  if (location === OcgcoreScriptConstants.LOCATION_MZONE) {
    return 0x881fff;
  }
  if (location === OcgcoreScriptConstants.LOCATION_SZONE) {
    return 0xe81fff;
  }
  if (location === OcgcoreScriptConstants.LOCATION_HAND) {
    return 0x681fff;
  }
  if (location === OcgcoreScriptConstants.LOCATION_GRAVE) {
    return 0x081fff;
  }
  if (location === OcgcoreScriptConstants.LOCATION_EXTRA) {
    return 0xe81fff;
  }
  return 0xf81fff;
}
