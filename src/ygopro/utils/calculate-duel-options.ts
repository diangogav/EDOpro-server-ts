import { HostInfo } from 'ygopro-msg-encode';
import { OcgcoreDuelOptionFlag } from 'koishipro-core.js';

/**
 * Calculate duel options from HostInfo
 * @param hostinfo HostInfo from ygopro-msg-encode
 * @param isTag Whether this is a tag duel
 * @returns Duel options number
 */
export function calculateDuelOptions(hostinfo: HostInfo): number {
  // duel_rule is stored in high 16 bits
  let opt = hostinfo.duel_rule << 16;

  if (hostinfo.no_shuffle_deck) {
    opt |= OcgcoreDuelOptionFlag.PseudoShuffle;
  }

  if (hostinfo.mode & 0x2) {
    opt |= OcgcoreDuelOptionFlag.TagMode;
  }

  return opt;
}
