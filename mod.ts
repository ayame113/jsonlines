// implemented to be streamed as:
// WritableStream -> ReadableStream(1) -> AsyncIterator -> ReadableStream(2)
// ReadableStream(2).pull called, then call AsyncIterator.next.
// AsyncIterator.next called, then call ReadableStream(1).pull.
// ReadableStream(1) and WritableStream are buffered by TransformStream.

declare global {
  // deno-lint-ignore no-explicit-any
  interface ReadableStream<R = any> {
    [Symbol.asyncIterator](options?: {
      preventCancel?: boolean;
    }): AsyncIterableIterator<R>;
  }
}

// polyfill for ReadableStream.prototype[Symbol.asyncIterator]
// https://bugs.chromium.org/p/chromium/issues/detail?id=929585#c10
if (typeof ReadableStream.prototype[Symbol.asyncIterator] !== "function") {
  ReadableStream.prototype[Symbol.asyncIterator] = async function* () {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

export type JSONValue =
  | { [key: string]: JSONValue }
  | JSONValue[]
  | string
  | number
  | boolean;

// avoid Node type error
declare abstract class T extends TransformStream<string, JSONValue> {}
/** QueuingStrategy<string> | undefined */
type QueuingStrategyString = ConstructorParameters<typeof T>[1];
/** QueuingStrategy<JSONValue> | undefined */
type QueuingStrategyJSONValue = ConstructorParameters<typeof T>[2];

export interface JSONLinesStreamOptions {
  /**a character to separate JSON. The character length must be 1. The default is '\n'. */
  separator?: string;
  /** Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream. */
  writableStrategy?: QueuingStrategyString;
  /** Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream. */
  readableStrategy?: QueuingStrategyJSONValue;
}

/** Convert an iterator into a TransformStream. */
function createStream(
  toIter: (src: ReadableStream<string>) => AsyncIterator<string, void, unknown>,
  { writableStrategy, readableStrategy }: JSONLinesStreamOptions,
) {
  const { writable, readable } = new TransformStream<string, string>(
    {},
    writableStrategy,
    readableStrategy,
  );
  const dataIterator = toIter(readable);
  return {
    writable,
    readable: new ReadableStream<JSONValue>({
      async pull(controller) {
        const { done, value } = await dataIterator.next();
        if (done) {
          controller.close();
          return;
        }

        let parsed;
        try {
          parsed = JSON.parse(value);
        } catch (error: unknown) {
          if (error instanceof Error) {
            throw new (error.constructor as ErrorConstructor)(
              `${error.message} (parsing: '${value}')`,
            );
          }
          throw error;
        }
        controller.enqueue(parsed);
      },
    }),
  };
}

/**
 * stream to parse JSONLines.
 *
 * ```ts
 * import { JSONLinesStream } from "https://deno.land/x/jsonlines@v0.0.5/mod.ts";
 *
 * const url = new URL("./testdata/json-lines.jsonl", import.meta.url);
 * const { body } = await fetch(`${url}`);
 *
 * const readable = body!
 *   .pipeThrough(new TextDecoderStream())
 *   .pipeThrough(new JSONLinesStream());
 *
 * for await (const data of readable) {
 *   console.log(data);
 * }
 * ```
 *
 * @param options
 * @param options.separator a character to separate JSON. The character length must be 1. The default is '\n'.
 * @param options.writableStrategy Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream.
 * @param options.readableStrategy Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream.
 */
export class JSONLinesStream implements TransformStream<string, JSONValue> {
  readonly writable: WritableStream<string>;
  readonly readable: ReadableStream<JSONValue>;
  #separator: string;
  constructor(options: JSONLinesStreamOptions = {}) {
    const { separator = "\n" } = options;
    if (count(separator) !== 1) {
      throw new Error(
        `The separator length should be 1, but it was ${count(separator)}.`,
      );
    }
    this.#separator = separator;

    const { writable, readable } = createStream(
      this.#separatorDelimitedJSONJSONIterator.bind(this),
      options,
    );
    this.writable = writable;
    this.readable = readable;
  }

  #targetString = "";
  #hasValue = false;
  #blank = new Set(" \t\r\n");
  async *#separatorDelimitedJSONJSONIterator(src: ReadableStream<string>) {
    for await (const string of src) {
      let sliceStart = 0;
      let i = -1;
      for (const char of string) {
        i += char.length;
        if (char === this.#separator) {
          if (this.#hasValue) {
            yield this.#targetString +
              string.slice(sliceStart, i + 1 - char.length);
          }
          this.#hasValue = false;
          this.#targetString = "";
          sliceStart = i + 1;
        } else if (!this.#hasValue && !this.#blank.has(char)) {
          // We want to ignore the character string with only blank, so if there is a character other than blank, record it.
          this.#hasValue = true;
        }
      }
      this.#targetString += string.slice(sliceStart);
    }
    if (this.#hasValue) {
      yield this.#targetString;
    }
  }
}

/**
 * stream to parse concatenated JSON.
 *
 * ```ts
 * import { ConcatenatedJSONStream } from "https://deno.land/x/jsonlines@v0.0.5/mod.ts";
 *
 * const url = new URL("./testdata/concat-json.concat-json", import.meta.url);
 * const { body } = await fetch(`${url}`);
 *
 * const readable = body!
 *   .pipeThrough(new TextDecoderStream())
 *   .pipeThrough(new ConcatenatedJSONStream());
 *
 * for await (const data of readable) {
 *   console.log(data);
 * }
 * ```
 *
 * @param options
 * @param options.writableStrategy Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream.
 * @param options.readableStrategy Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream.
 */
export class ConcatenatedJSONStream
  implements TransformStream<string, JSONValue> {
  readonly writable: WritableStream<string>;
  readonly readable: ReadableStream<JSONValue>;
  constructor(options: JSONLinesStreamOptions = {}) {
    const { writable, readable } = createStream(
      this.#concatenatedJSONIterator.bind(this),
      options,
    );
    this.writable = writable;
    this.readable = readable;
  }

  #targetString = "";
  #hasValue = false;
  #blank = new Set(" \t\r\n");
  #nestCount = 0;
  #readingString = false;
  #escapeNext = false;
  async *#concatenatedJSONIterator(src: ReadableStream<string>) {
    // Counts the number of '{', '}', '[', ']', and when the nesting level reaches 0, concatenates and returns the string.
    for await (const string of src) {
      let sliceStart = 0;
      let i = -1;
      for (const char of string) {
        i += char.length;

        if (this.#readingString) {
          if (char === '"' && !this.#escapeNext) {
            this.#readingString = false;

            // When the nesting level is 0, it returns a string when '"' comes.
            if (this.#nestCount === 0 && this.#hasValue) {
              yield this.#targetString + string.slice(sliceStart, i + 1);
              this.#hasValue = false;
              this.#targetString = "";
              sliceStart = i + 1;
            }
          }
          this.#escapeNext = !this.#escapeNext && char === "\\";
          continue;
        }

        switch (char) {
          case '"':
            this.#readingString = true;
            this.#escapeNext = false;
            break;
          case "{":
          case "[":
            this.#nestCount++;
            break;
          case "}":
          case "]":
            this.#nestCount--;
            break;
          default:
            break;
        }

        if (
          this.#nestCount === 0 && this.#hasValue &&
          (char === "}" || char === "]" || char === '"' || char === " ")
        ) {
          yield this.#targetString + string.slice(sliceStart, i + 1);
          this.#hasValue = false;
          this.#targetString = "";
          sliceStart = i + 1;
        } else if (!this.#hasValue && !this.#blank.has(char)) {
          // We want to ignore the character string with only blank, so if there is a character other than blank, record it.
          this.#hasValue = true;
        }
      }
      this.#targetString += string.slice(sliceStart);
    }
    if (this.#hasValue) {
      yield this.#targetString;
    }
  }
}

/** Count the number of characters in consideration of surrogate pairs. */
function count(iterator: Iterable<unknown>) {
  let count = 0;
  for (const _ of iterator) {
    count++;
  }
  return count;
}
