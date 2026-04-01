import * as fs from 'node:fs';
import { createHash, Hash } from 'node:crypto';
import { searchYGOProResource } from 'koishipro-core.js';
import type { CardDataEntry } from 'ygopro-cdb-encode';
import { YGOProCdb } from 'ygopro-cdb-encode';
import initSqlJs from 'sql.js';
import {
  DefineWorker,
  TransportType,
  WorkerMethod,
  toShared,
} from 'yuzuthread';
import { CardStorage } from './card-storage';

const isFileNotFoundError = (error: unknown): error is NodeJS.ErrnoException =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as NodeJS.ErrnoException).code === 'ENOENT';

const hashWithSizePrefix = (hash: Hash, payload: Buffer) => {
  const sizePrefix = Buffer.allocUnsafe(4);
  sizePrefix.writeUInt32BE(payload.length >>> 0, 0);
  hash.update(sizePrefix);
  hash.update(payload);
};

const hashWithSizePrefixText = (hash: Hash, text: string) => {
  hashWithSizePrefix(hash, Buffer.from(text, 'utf8'));
};

export class CardLoadWorkerResult {
  @TransportType(() => CardStorage)
  cardStorage: CardStorage;

  dbCount: number;
  failedFiles: string[];

  @TransportType(() => Buffer)
  sha512: Buffer;
}

@DefineWorker()
export class CardLoadWorker {
  constructor(
    private ygoproPaths: string[],
    private ocgcoreWasmPath?: string,
  ) {}

  @WorkerMethod()
  @TransportType(() => CardLoadWorkerResult)
  async load(): Promise<CardLoadWorkerResult> {
    const SQL = await initSqlJs();
    const cards: CardDataEntry[] = [];
    const seen = new Set<number>();
    let dbCount = 0;
    const failedFiles: string[] = [];
    const sha512 = createHash('sha512');
    const openCdbs: YGOProCdb[] = [];

    try {
      for await (const file of searchYGOProResource(...this.ygoproPaths)) {
        if (!file.path.endsWith('.cdb')) {
          continue;
        }

        try {
          const cdbBody = await file.read();
          const cdb = new YGOProCdb(new SQL.Database(cdbBody)).noTexts();
          openCdbs.push(cdb);
          for (const card of cdb.step()) {
            const cardId = (card.code ?? 0) >>> 0;
            if (cardId === 0 || seen.has(cardId)) {
              continue;
            }
            seen.add(cardId);
            cards.push(card);
          }
          ++dbCount;
          hashWithSizePrefixText(sha512, file.path);
          hashWithSizePrefix(sha512, Buffer.from(cdbBody));
        } catch (error) {
          failedFiles.push(`${file.path}: ${error}`);
        }
      }

      for (const cdb of openCdbs) {
        cdb.resolveRuleCode(cards);
      }
    } finally {
      for (const cdb of openCdbs) {
        try {
          cdb.finalize();
        } catch {
          // ignore close errors
        }
      }
    }

    let ocgcoreWasmBinary: Buffer | undefined;
    if (this.ocgcoreWasmPath) {
      try {
        const wasmBinary = Buffer.from(
          await fs.promises.readFile(this.ocgcoreWasmPath),
        );
        hashWithSizePrefixText(sha512, this.ocgcoreWasmPath);
        hashWithSizePrefix(sha512, wasmBinary);
        ocgcoreWasmBinary = toShared(wasmBinary);
      } catch (error) {
        if (!isFileNotFoundError(error)) {
          throw error;
        }
      }
    }

    const result = new CardLoadWorkerResult();
    result.cardStorage = toShared(
      CardStorage.fromCards(cards, ocgcoreWasmBinary),
    );
    result.dbCount = dbCount;
    result.failedFiles = failedFiles;
    result.sha512 = toShared(sha512.digest());
    return result;
  }
}
