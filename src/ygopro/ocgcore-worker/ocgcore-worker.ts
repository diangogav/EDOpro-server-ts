import 'reflect-metadata';
import {
  OcgcoreDuel,
  OcgcoreMessageType,
  OcgcoreWrapper,
  createOcgcoreWrapper,
  DirScriptReaderEx,
  _OcgcoreConstants,
  parseCardQuery,
  parseFieldCardQuery,
  parseFieldInfo,
} from 'koishipro-core.js';
import type {
  OcgcoreQueryCardParams,
  OcgcoreQueryFieldCardParams,
  OcgcoreQueryFieldCountParams,
  OcgcoreProcessResult,
  OcgcoreCardQueryResult,
  OcgcoreFieldCardQueryResult,
  OcgcoreFieldInfoResult,
} from 'koishipro-core.js';
import {
  DefineWorker,
  WorkerCallback,
  WorkerFinalize,
  WorkerInit,
  WorkerMethod,
  TransportType,
  TransportEncoder,
} from 'yuzuthread';
import { OcgcoreWorkerOptions } from './ocgcore-worker-options';
import { ReplaySubject, Subject } from 'rxjs';
import { calculateDuelOptions } from '../utils/calculate-duel-options';
import {
  YGOProMessages,
  YGOProMsgResponseBase,
  YGOProMsgRetry,
} from 'ygopro-msg-encode';

const { OcgcoreScriptConstants } = _OcgcoreConstants;
const OCGCORE_MESSAGE_REPLAY_BUFFER_SIZE = 128;
const ADVANCE_PROCESS_TIMEOUT_MS = 1 * 60 * 1000;

export class OcgcoreProcessTimeoutError extends Error {
  readonly isOcgcoreProcessTimeoutError = true;

  constructor(timeoutMs = ADVANCE_PROCESS_TIMEOUT_MS) {
    super(`ocgcore process timed out after ${timeoutMs}ms`);
    this.name = 'OcgcoreProcessTimeoutError';
  }

  static is(error: unknown): error is OcgcoreProcessTimeoutError {
    if (error instanceof OcgcoreProcessTimeoutError) {
      return true;
    }
    if (!error || typeof error !== 'object') {
      return false;
    }
    return (
      'isOcgcoreProcessTimeoutError' in error ||
      (error as { name?: unknown }).name === 'OcgcoreProcessTimeoutError'
    );
  }
}

// Serializable types for transport (noParse mode: only send binary data)
interface SerializableProcessResult {
  length: number;
  raw: Uint8Array;
  status: number;
  encodeError?: string;
}

export type OcgcoreProcessResultWithEncodeError = OcgcoreProcessResult & {
  encodeError?: string;
};

interface SerializableCardQueryResult {
  length: number;
  raw: Uint8Array;
}

interface SerializableFieldCardQueryResult {
  length: number;
  raw: Uint8Array;
}

interface SerializableFieldInfoResult {
  length: number;
  raw: Uint8Array;
}

@DefineWorker()
export class OcgcoreWorker {
  private ocgcore: OcgcoreWrapper;
  private duel: OcgcoreDuel;

  constructor(private options: OcgcoreWorkerOptions) { }

  message$ = new ReplaySubject<{
    message: string;
    type: OcgcoreMessageType;
  }>(OCGCORE_MESSAGE_REPLAY_BUFFER_SIZE);
  registry$ = new Subject<Record<string, string>>();

  // this only exists in the worker thread
  @WorkerCallback()
  async handleMessage(message: string, type: OcgcoreMessageType) {
    this.message$.next({ message, type });
  }

  @WorkerCallback()
  private async masterFinalize(registryData: Record<string, string>) {
    this.registry$.next(registryData);
    this.registry$.complete();
    this.message$.complete();
  }

  @WorkerInit()
  async init() {
    const wasmBinary = this.options.ocgcoreWasmBinary;

    // Create ocgcore wrapper
    this.ocgcore = await createOcgcoreWrapper(
      wasmBinary ? { wasmBinary } : undefined,
    );
    this.ocgcore.setMessageHandler(async (_, message, type) => {
      await this.handleMessage(message, type);
    });

    // Load script reader and card reader
    const scriptReader = await DirScriptReaderEx(...this.options.ygoproPaths);
    const cardReader = this.options.cardStorage.toCardReader();
    this.ocgcore.setScriptReader(scriptReader);
    this.ocgcore.setCardReader(cardReader);

    // Create duel with seed
    this.duel = this.ocgcore.createDuelV2(this.options.seed);

    // Load registry if provided
    if (this.options.registry) {
      this.duel.loadRegistry(this.options.registry);
    }

    // Set player info for both players
    const { hostinfo } = this.options;
    for (let i = 0; i < 2; i++) {
      console.log(`[WORKER] Setting player ${i} info - LP: ${hostinfo.start_lp}, Hand: ${hostinfo.start_hand}, Draw: ${hostinfo.draw_count}`);
      this.duel.setPlayerInfo({
        player: i,
        lp: Number(hostinfo.start_lp),
        startHand: Number(hostinfo.start_hand),
        drawCount: Number(hostinfo.draw_count),
      });
    }

    // Load extra scripts
    for (const path of this.options.extraScriptPaths) {
      this.duel.preloadScript(path);
    }

    // Calculate duel options
    const opt = calculateDuelOptions(hostinfo);

    // Helper function to load a deck
    const loadDeck = (
      deck: (typeof this.options.decks)[0],
      owner: number,
      player: number,
    ) => {
      for (const card of [...deck.main].reverse()) {
        this.duel.newCard({
          code: card,
          owner,
          player,
          location: OcgcoreScriptConstants.LOCATION_DECK,
          sequence: 0,
          position: OcgcoreScriptConstants.POS_FACEDOWN_DEFENSE,
        });
      }
      for (const card of [...deck.extra].reverse()) {
        this.duel.newCard({
          code: card,
          owner,
          player,
          location: OcgcoreScriptConstants.LOCATION_EXTRA,
          sequence: 0,
          position: OcgcoreScriptConstants.POS_FACEDOWN_DEFENSE,
        });
      }
    };

    // Helper function to load a tag deck
    const loadTagDeck = (
      deck: (typeof this.options.decks)[0],
      owner: number,
    ) => {
      for (const card of [...deck.main].reverse()) {
        this.duel.newTagCard({
          code: card,
          owner,
          location: OcgcoreScriptConstants.LOCATION_DECK,
        });
      }
      for (const card of [...deck.extra].reverse()) {
        this.duel.newTagCard({
          code: card,
          owner,
          location: OcgcoreScriptConstants.LOCATION_EXTRA,
        });
      }
    };

    // Load decks
    if (this.options.hostinfo.mode & 0x2) {
      // Tag duel: decks[0] for player 0 main, decks[1] for player 0 tag,
      //           decks[2] for player 1 main, decks[3] for player 1 tag
      // In tag mode: player 0 main and player 1 tag start, using newCard
      //              player 0 tag and player 1 main use newTagCard
      if (this.options.decks[0]) loadDeck(this.options.decks[0], 0, 0);
      if (this.options.decks[1]) loadTagDeck(this.options.decks[1], 0);
      if (this.options.decks[3]) loadDeck(this.options.decks[3], 1, 1);
      if (this.options.decks[2]) loadTagDeck(this.options.decks[2], 1);
    } else {
      // Single duel: decks[0] for player 0, decks[1] for player 1
      for (let i = 0; i < 2 && i < this.options.decks.length; i++) {
        loadDeck(this.options.decks[i], i, i);
      }
    }

    // Start duel
    this.duel.startDuel(opt);
  }

  // Wrapper methods for OcgcoreDuel

  @WorkerMethod()
  @TransportEncoder<
    OcgcoreProcessResultWithEncodeError,
    SerializableProcessResult
  >(
    // serialize in worker: only send raw
    (result) => ({
      length: result.length,
      raw: result.raw,
      status: result.status,
    }),
    // deserialize in main thread: re-parse from raw
    (serialized) => {
      let message;
      let messages;
      let encodeError: string | undefined;

      if (serialized.raw.length > 0) {
        try {
          messages = YGOProMessages.getInstancesFromPayload(serialized.raw);
          message = messages[messages.length - 1];
          if (!messages.length) {
            encodeError = 'failed to decode any game messages';
          } else {
            const consumed = messages.reduce(
              (sum, msg) => sum + msg.toPayload().length,
              0,
            );
            if (consumed < serialized.raw.length) {
              const remainingBytes = serialized.raw.slice(consumed);
              let trailingEncodeError = '';
              try {
                const s = YGOProMessages.getInstanceFromPayload(remainingBytes);
                if (s) {
                  trailingEncodeError = `[trailing: ${s.constructor.name} ${JSON.stringify(s)}]`;
                }
              } catch (e) {
                trailingEncodeError =
                  e instanceof Error ? e.message : String(e);
              }
              const nextIdentifier = serialized.raw[consumed];
              encodeError =
                `decoded ${messages.length} message(s) but left trailing bytes: ` +
                `total=${serialized.raw.length}, consumed=${consumed}, nextIdentifier=${nextIdentifier ?? 'n/a'}, lastMessage=${message.constructor.name}, anotherLastMessage=${messages.length > 1 ? messages[messages.length - 2].constructor.name : 'n/a'}, trailingEncodeError=${trailingEncodeError}`;
            }
          }
        } catch (error) {
          message = undefined;
          messages = undefined;
          encodeError = error instanceof Error ? error.message : String(error);
        }
      }

      return {
        length: serialized.length,
        raw: serialized.raw,
        status: serialized.status,
        message,
        messages,
        encodeError,
      };
    },
  )
  async process(): Promise<OcgcoreProcessResultWithEncodeError> {
    return this.duel.process({ noParse: true });
  }

  private splitProcessResult(
    res: OcgcoreProcessResultWithEncodeError,
  ): OcgcoreProcessResultWithEncodeError[] {
    if (!res.messages || res.messages.length <= 1) {
      return [res];
    }

    const messageCount = res.messages.length;
    return res.messages.map((message, index) => {
      const raw = message.toPayload();
      return {
        ...res,
        length: raw.length,
        raw,
        status: index === messageCount - 1 ? res.status : 0,
        message,
        messages: [message],
        encodeError: index === messageCount - 1 ? res.encodeError : undefined,
      };
    });
  }

  @WorkerMethod()
  async setResponseInt(@TransportType() value: number) {
    this.duel.setResponseInt(value);
  }

  @WorkerMethod()
  async setResponse(@TransportType() response: Uint8Array | number) {
    this.duel.setResponse(response);
  }

  @WorkerMethod()
  @TransportEncoder<OcgcoreCardQueryResult, SerializableCardQueryResult>(
    // serialize in worker: only send raw
    (result) => ({
      length: result.length,
      raw: result.raw,
    }),
    // deserialize in main thread: re-parse from raw
    (serialized) => ({
      length: serialized.length,
      raw: serialized.raw,
      card: parseCardQuery(serialized.raw, serialized.length),
    }),
  )
  async queryCard(
    @TransportType() query: OcgcoreQueryCardParams,
  ): Promise<OcgcoreCardQueryResult<true>> {
    return this.duel.queryCard(query, { noParse: true }) as OcgcoreCardQueryResult<true>;
  }

  @WorkerMethod()
  async queryFieldCount(
    @TransportType() query: OcgcoreQueryFieldCountParams,
  ): Promise<number> {
    return this.duel.queryFieldCount(query);
  }

  @WorkerMethod()
  @TransportEncoder<
    OcgcoreFieldCardQueryResult,
    SerializableFieldCardQueryResult
  >(
    // serialize in worker: only send raw
    (result) => ({
      length: result.length,
      raw: result.raw,
    }),
    // deserialize in main thread: re-parse from raw
    (serialized) => ({
      length: serialized.length,
      raw: serialized.raw,
      cards: parseFieldCardQuery(serialized.raw, serialized.length),
    }),
  )
  async queryFieldCard(
    @TransportType() query: OcgcoreQueryFieldCardParams,
  ): Promise<OcgcoreFieldCardQueryResult<true>> {
    return this.duel.queryFieldCard(query, { noParse: true }) as OcgcoreFieldCardQueryResult<true>;
  }

  @WorkerMethod()
  @TransportEncoder<OcgcoreFieldInfoResult, SerializableFieldInfoResult>(
    // serialize in worker: only send raw
    (result) => ({
      length: result.length,
      raw: result.raw,
    }),
    // deserialize in main thread: re-parse from raw
    (serialized) => ({
      length: serialized.length,
      raw: serialized.raw,
      field: parseFieldInfo(serialized.raw),
    }),
  )
  async queryFieldInfo(): Promise<OcgcoreFieldInfoResult<true>> {
    return this.duel.queryFieldInfo({ noParse: true }) as OcgcoreFieldInfoResult<true>;
  }

  async *advance(): AsyncGenerator<OcgcoreProcessResultWithEncodeError> {
    while (true) {
      const processResult = await this.processWithTimeout();
      const processedResults = this.splitProcessResult(processResult);

      for (const res of processedResults) {
        if (res.raw.length === 0) {
          continue;
        }

        yield res;

        if (res.status === 2) {
          return;
        }

        if (res.message instanceof YGOProMsgRetry) {
          return;
        }

        if (res.message instanceof YGOProMsgResponseBase) {
          return;
        }
      }
    }
  }

  private async processWithTimeout(): Promise<OcgcoreProcessResultWithEncodeError> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.process(),
        new Promise<OcgcoreProcessResultWithEncodeError>((_, reject) => {
          timeout = setTimeout(() => {
            reject(new OcgcoreProcessTimeoutError());
          }, ADVANCE_PROCESS_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  @WorkerMethod()
  async getRegistryValue(@TransportType() key: string) {
    return this.duel.getRegistryValue(key);
  }

  @WorkerMethod()
  async setRegistryValue(
    @TransportType() key: string,
    @TransportType() value: string,
  ) {
    this.duel.setRegistryValue(key, value);
  }

  @WorkerMethod()
  async getRegistryKeys() {
    return this.duel.getRegistryKeys();
  }

  @WorkerMethod()
  async clearRegistry() {
    this.duel.clearRegistry();
  }

  @WorkerMethod()
  async dumpRegistry() {
    return this.duel.dumpRegistry();
  }

  @WorkerMethod()
  async loadRegistry(
    @TransportType() input: Uint8Array | Record<string, string>,
  ) {
    this.duel.loadRegistry(input);
  }

  @WorkerMethod()
  @WorkerFinalize()
  async dispose() {
    // masterFinalize must always run; fallback to {} when dump fails.
    let registryData: Record<string, string> = {};
    if (this.duel && !this.duel.ended) {
      try {
        const registryDump = this.duel.dumpRegistry();
        registryData = registryDump.dict;
      } catch (error) {
        console.warn('Failed to dump registry in OcgcoreWorker.dispose', error);
      }
    }
    await this.masterFinalize(registryData);

    if (this.duel && !this.duel.ended) {
      try {
        this.duel.endDuel();
      } catch (e) {
        console.warn('Failed to end duel in OcgcoreWorker.dispose', e);
      }
    }
    this.ocgcore.finalize();
  }
}
