/**
 * Simple middleware system for game messages
 *
 * Based on srvpro2's ProtoMiddlewareDispatcher but simplified
 * without external dependencies.
 *
 * Supports inheritance - handlers registered for base classes
 * will also be called for derived classes.
 *
 * Usage:
 *   const middleware = new GameMessageMiddleware();
 *
 *   middleware.on(YGOProMsgNewTurn, (msg) => {
 *     console.log('New turn:', msg.player);
 *     return msg; // return modified message or null to block
 *   });
 *
 *   const result = await middleware.process(message);
 *   if (result === null) {
 *     // message was blocked
 *   }
 */

export type MessageHandler<T> = (msg: T) => T | null;

interface MiddlewareEntry<T> {
  handler: MessageHandler<T>;
  priority: number;
}

export class GameMessageMiddleware {
  private handlers: Map<string, MiddlewareEntry<any>[]> = new Map();

  /**
   * Register a handler for a specific message type
   */
  on<T>(
    messageType: new (...args: any[]) => T,
    handler: MessageHandler<T>,
    priority: number = 0,
  ): this {
    const typeName = messageType.name;

    if (!this.handlers.has(typeName)) {
      this.handlers.set(typeName, []);
    }

    const entries = this.handlers.get(typeName)!;
    entries.push({ handler, priority });

    // Sort by priority (lower = earlier)
    entries.sort((a, b) => a.priority - b.priority);

    return this;
  }

  /**
   * Process a message through all registered handlers
   * Checks the entire inheritance chain
   */
  async process<T>(msg: T): Promise<T | null> {
    if (!msg) {
      return msg;
    }

    // Get all handlers for this message type and its parent types
    const typeChain = this.getTypeChain(msg);

    // Collect all handlers from the type chain
    const allHandlers: Array<{ handler: MessageHandler<T>; priority: number }> =
      [];

    for (const typeName of typeChain) {
      const entries = this.handlers.get(typeName);
      if (entries) {
        allHandlers.push(...entries);
      }
    }

    if (allHandlers.length === 0) {
      return msg;
    }

    // Sort by priority (lower priority = runs first)
    allHandlers.sort((a, b) => a.priority - b.priority);

    let result: T | null = msg;

    for (const { handler } of allHandlers) {
      result = handler(result);

      if (result === null) {
        return null; // Blocked by middleware
      }
    }

    return result;
  }

  /**
   * Get the inheritance chain of a message (from most specific to most general)
   */
  private getTypeChain(msg: any): string[] {
    const chain: string[] = [];
    let current = msg?.constructor;

    while (current && current.name) {
      chain.push(current.name);
      current = Object.getPrototypeOf(current);
    }

    return chain;
  }

  /**
   * Process a message synchronously (no async handlers)
   * Checks the entire inheritance chain
   */
  processSync<T>(msg: T): T | null {
    if (!msg) {
      return msg;
    }

    // Get all handlers for this message type and its parent types
    const typeChain = this.getTypeChain(msg);

    // Collect all handlers from the type chain
    const allHandlers: Array<{ handler: MessageHandler<T>; priority: number }> =
      [];

    for (const typeName of typeChain) {
      const entries = this.handlers.get(typeName);
      if (entries) {
        allHandlers.push(...entries);
      }
    }

    if (allHandlers.length === 0) {
      return msg;
    }

    // Sort by priority
    allHandlers.sort((a, b) => a.priority - b.priority);

    let result: T | null = msg;

    for (const { handler } of allHandlers) {
      result = handler(result);

      if (result === null) {
        return null; // Blocked by middleware
      }
    }

    return result;
  }

  /**
   * Clear all handlers for a specific type
   */
  clear(typeName: string): void {
    this.handlers.delete(typeName);
  }

  /**
   * Clear all handlers
   */
  clearAll(): void {
    this.handlers.clear();
  }

  /**
   * Get number of registered handlers
   */
  getHandlerCount(typeName?: string): number {
    if (typeName) {
      return this.handlers.get(typeName)?.length ?? 0;
    }

    let total = 0;
    for (const entries of this.handlers.values()) {
      total += entries.length;
    }
    return total;
  }
}
