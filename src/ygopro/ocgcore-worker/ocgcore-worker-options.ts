import YGOProDeck from 'ygopro-deck-encode';
import { HostInfo } from 'ygopro-msg-encode';
import { TransportType } from 'yuzuthread';
import { CardStorage } from '../ygopro';

export class OcgcoreWorkerOptions {
  ygoproPaths: string[];
  extraScriptPaths: string[];
  @TransportType(() => CardStorage)
  cardStorage: CardStorage;
  @TransportType(() => Buffer)
  ocgcoreWasmBinary?: Buffer;
  seed: number[];
  hostinfo: HostInfo;
  @TransportType(() => [YGOProDeck])
  decks: YGOProDeck[];
  registry: Record<string, string>;
}
