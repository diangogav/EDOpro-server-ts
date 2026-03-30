import type { CardReaderFn } from "koishipro-core.js";
import { searchYGOProResource } from "koishipro-core.js";
import { YGOProLFList } from "ygopro-lflist-encode";
import path from "node:path";
import { runInWorker } from "yuzuthread";
import BetterLock from "better-lock";
import { CardStorage } from "./card-storage";
import { CardLoadWorker } from "./card-load-worker";
import { Logger } from "src/shared/logger/domain/Logger";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";
import { config } from "src/config";

const CARD_STORAGE_RELOAD_INTERVAL_MS = 10 * 60 * 1000;

let _sharedInstance: YGOProResourceLoader | null = null;

export class YGOProResourceLoader {
  private readonly logger: Logger;

  constructor() {
    this.logger = LoggerFactory.getLogger();
    this.registerReloadTimer();
  }

  static getShared(): YGOProResourceLoader {
    if (!_sharedInstance) {
      throw new Error(
        "YGOProResourceLoader not initialized. Call initShared() in index.ts first.",
      );
    }
    return _sharedInstance;
  }

  static async start(): Promise<void> {
    const loader = YGOProResourceLoader.get();
    await loader.getCardStorage();
  }

  static get(): YGOProResourceLoader {
    if (_sharedInstance) {
      return _sharedInstance;
    }
    _sharedInstance = new YGOProResourceLoader();
    return _sharedInstance;
  }

  static get isInitialized(): boolean {
    return _sharedInstance !== null;
  }

  ygoproPaths = config.resources.ygopro.folders;

  extraScriptPaths = config.resources.ygopro.extraScripts;

  private loadingLock = new BetterLock();
  private loadingCardStorage?: Promise<CardStorage>;
  private currentCardStorage?: CardStorage;
  private currentCardStorageSha512?: Buffer;
  private reloadTimerRegistered = false;

  async getCardStorage() {
    if (this.currentCardStorage) {
      return this.currentCardStorage;
    }
    if (this.loadingCardStorage) {
      return this.loadingCardStorage;
    }
    return this.loadYGOProCdbs();
  }

  async getCardReader(): Promise<CardReaderFn> {
    const storage = await this.getCardStorage();
    return storage.toCardReader();
  }

  async getOcgcoreWasmBinary() {
    const storage = await this.getCardStorage();
    return storage.ocgcoreWasmBinary;
  }

  async loadYGOProCdbs() {
    if (this.loadingCardStorage) {
      return this.loadingCardStorage;
    }
    const loading = this.loadingLock.acquire(async () => {
      const { cardStorage, sha512 } = await this.loadCardStorage();
      const storage = cardStorage;
      this.currentCardStorage = storage;
      this.currentCardStorageSha512 = sha512;
      return storage;
    });
    this.loadingCardStorage = loading;
    try {
      return await loading;
    } finally {
      if (this.loadingCardStorage === loading) {
        this.loadingCardStorage = undefined;
      }
    }
  }

  private registerReloadTimer() {
    if (this.reloadTimerRegistered) {
      return;
    }
    this.reloadTimerRegistered = true;
    setInterval(() => {
      this.reloadYGOProCdbsIfChanged().catch((error) => {
        this.logger.error("Failed reloading card storage by periodic refresh");
        this.logger.error(error);
      });
    }, CARD_STORAGE_RELOAD_INTERVAL_MS);
  }

  private async reloadYGOProCdbsIfChanged() {
    if (!this.currentCardStorage) {
      await this.loadYGOProCdbs();
      return;
    }
    if (this.loadingCardStorage) {
      await this.loadingCardStorage;
      return;
    }
    const loading = this.loadingLock.acquire(async () => {
      const { cardStorage, sha512 } = await this.loadCardStorage();
      if (this.currentCardStorageSha512?.equals(sha512)) {
        this.logger.debug("Card storage hash unchanged, keeping current data");
        return this.currentCardStorage!;
      }
      this.currentCardStorage = cardStorage;
      this.currentCardStorageSha512 = sha512;
      this.logger.info("Card storage hash changed, replaced current data");
      return cardStorage;
    });
    this.loadingCardStorage = loading;
    try {
      await loading;
    } finally {
      if (this.loadingCardStorage === loading) {
        this.loadingCardStorage = undefined;
      }
    }
  }

  private async loadCardStorage() {
    const ocgcoreWasmPathConfig = "./ocgcore-worker";
    const ocgcoreWasmPath = ocgcoreWasmPathConfig
      ? path.resolve(process.cwd(), ocgcoreWasmPathConfig)
      : undefined;
    const { cardStorage, dbCount, failedFiles, sha512 } = await runInWorker(
      CardLoadWorker,
      (worker) => worker.load(),
      this.ygoproPaths,
      ocgcoreWasmPath,
    );

    for (const failedFile of failedFiles) {
      this.logger.error(`Failed to read ${failedFile}`);
    }
    this.logger.info(
      `Merged database from ${dbCount} databases with ${cardStorage.size} cards`,
    );
    return {
      cardStorage,
      sha512,
    };
  }

  async *getLFLists() {
    for await (const file of searchYGOProResource(...this.ygoproPaths)) {
      const filename = path.basename(file.path);
      if (filename !== "lflist.conf") {
        continue;
      }
      const buf = await file.read();
      const lflist = new YGOProLFList().fromText(
        Buffer.from(buf).toString("utf-8"),
      );
      for (const item of lflist.items) {
        yield item;
      }
    }
  }

  async logLFLists(): Promise<void> {
    this.logger.info("Loading Forbidden/Limited Lists...");
    let index = 0;
    for await (const lflist of this.getLFLists()) {
      this.logger.info(`  [${index}] ${lflist.name || "Unnamed"} ${lflist.getHash()}`);
      index++;
    }
    if (index === 0) {
      this.logger.error("No lflist.conf found in ygoproPaths");
    } else {
      this.logger.info(`Total LFLists loaded: ${index}`);
    }
  }
}
