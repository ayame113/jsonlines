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

// avoid dnt typecheck error
type _QueuingStrategy<T> = QueuingStrategy extends
  ConstructorParameters<typeof TransformStream> ? QueuingStrategy<T>
  : // deno-lint-ignore no-explicit-any
  any;

export type JSONValue =
  | { [key: string]: JSONValue }
  | JSONValue[]
  | string
  | number
  | boolean;

export interface ParseStreamOptions {
  /**a character to separate JSON. The character length must be 1. The default is '\n'. */
  readonly separator?: string;
  /** Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream. */
  readonly writableStrategy?: _QueuingStrategy<string>;
  /** Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream. */
  readonly readableStrategy?: _QueuingStrategy<JSONValue>;
}

export interface StringifyStreamOptions {
  /**a character to separate JSON. The character length must be 1. The default is '\n'. */
  readonly separator?: string;
  /** Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream. */
  readonly writableStrategy?: _QueuingStrategy<unknown>;
  /** Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream. */
  readonly readableStrategy?: _QueuingStrategy<string>;
}

//output: 0, 100, 200
/**
 * Convert the generator function into a TransformStream.
 *
 * ```ts
 * import { readableStreamFromIterable } from "https://deno.land/std@0.138.0/streams/mod.ts";
 * import { transformStreamFromGeneratorFunction } from "./mod.ts";
 *
 * const reader = readableStreamFromIterable([0, 1, 2])
 *   .pipeThrough(transformStreamFromGeneratorFunction(async function* (src) {
 *     for await (const chunk of src) {
 *       yield chunk * 100;
 *     }
 *   }));
 *
 * for await (const chunk of reader) {
 *   console.log(chunk);
 * }
 * // output: 0, 100, 200
 * ```
 *
 * @param transformer A function to transform.
 * @param writableStrategy An object that optionally defines a queuing strategy for the stream.
 * @param readableStrategy An object that optionally defines a queuing strategy for the stream.
 */
export function transformStreamFromGeneratorFunction<I, O>(
  transformer: (src: AsyncIterable<I>) => Iterable<O> | AsyncIterable<O>,
  writableStrategy?: _QueuingStrategy<I>,
  readableStrategy?: _QueuingStrategy<O>,
): TransformStream<I, O> {
  const {
    writable,
    readable,
  } = new TransformStream<I, I>(undefined, writableStrategy);

  const iterable = transformer(readable);
  const iterator: Iterator<O> | AsyncIterator<O> =
    (iterable as AsyncIterable<O>)[Symbol.asyncIterator]?.() ??
      (iterable as Iterable<O>)[Symbol.iterator]?.();
  return {
    writable,
    readable: new ReadableStream<O>({
      async pull(controller) {
        const { done, value } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      },
      async cancel(...args) {
        await readable.cancel(...args);
      },
    }, readableStrategy),
  };
}

/**
 * stream to parse JSONLines.
 *
 * ```ts
 * import { JSONLinesParseStream } from "https://deno.land/x/jsonlines@v1.0.0/mod.ts";
 *
 * const url = new URL("./testdata/json-lines.jsonl", import.meta.url);
 * const { body } = await fetch(`${url}`);
 *
 * const readable = body!
 *   .pipeThrough(new TextDecoderStream())
 *   .pipeThrough(new JSONLinesParseStream());
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
export class JSONLinesParseStream
  implements TransformStream<string, JSONValue> {
  readonly writable: WritableStream<string>;
  readonly readable: ReadableStream<JSONValue>;
  #separator: string;
  constructor({
    separator = "\n",
    writableStrategy,
    readableStrategy,
  }: ParseStreamOptions = {}) {
    if (separator.length !== 1) {
      throw new Error(
        `The separator length should be 1, but it was ${separator.length}.`,
      );
    }
    this.#separator = separator;

    const { writable, readable } = transformStreamFromGeneratorFunction(
      this.#separatorDelimitedJSONIterator.bind(this),
      writableStrategy,
      readableStrategy,
    );
    this.writable = writable;
    this.readable = readable;
  }

  #targetString = "";
  #hasValue = false;
  async *#separatorDelimitedJSONIterator(src: AsyncIterable<string>) {
    for await (const string of src) {
      let sliceStart = 0;
      for (let i = 0; i < string.length; i++) {
        const char = string[i];
        if (char === this.#separator) {
          if (this.#hasValue) {
            yield parse(this.#targetString + string.slice(sliceStart, i));
          }
          this.#hasValue = false;
          this.#targetString = "";
          sliceStart = i + 1;
        } else if (!this.#hasValue && !isBrankChar(char)) {
          // We want to ignore the character string with only blank, so if there is a character other than blank, record it.
          this.#hasValue = true;
        }
      }
      this.#targetString += string.slice(sliceStart);
    }
    if (this.#hasValue) {
      yield parse(this.#targetString);
    }
  }
}

/**
 * stream to parse concatenated JSON.
 *
 * ```ts
 * import { ConcatenatedJSONParseStream } from "https://deno.land/x/jsonlines@v1.0.0/mod.ts";
 *
 * const url = new URL("./testdata/concat-json.concat-json", import.meta.url);
 * const { body } = await fetch(`${url}`);
 *
 * const readable = body!
 *   .pipeThrough(new TextDecoderStream())
 *   .pipeThrough(new ConcatenatedJSONParseStream());
 *
 * for await (const data of readable) {
 *   console.log(data);
 * }
 * ```
 *
 * @param options
 * @param options.separator This parameter will be ignored.
 * @param options.writableStrategy Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream.
 * @param options.readableStrategy Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream.
 */
export class ConcatenatedJSONParseStream
  implements TransformStream<string, JSONValue> {
  readonly writable: WritableStream<string>;
  readonly readable: ReadableStream<JSONValue>;
  constructor(options: ParseStreamOptions = {}) {
    const { writable, readable } = transformStreamFromGeneratorFunction(
      this.#concatenatedJSONIterator.bind(this),
      options.writableStrategy,
      options.readableStrategy,
    );
    this.writable = writable;
    this.readable = readable;
  }

  #targetString = "";
  #hasValue = false;
  #nestCount = 0;
  #readingString = false;
  #escapeNext = false;
  async *#concatenatedJSONIterator(src: AsyncIterable<string>) {
    // Counts the number of '{', '}', '[', ']', and when the nesting level reaches 0, concatenates and returns the string.
    for await (const string of src) {
      let sliceStart = 0;
      for (let i = 0; i < string.length; i++) {
        const char = string[i];

        if (this.#readingString) {
          if (char === '"' && !this.#escapeNext) {
            this.#readingString = false;

            // When the nesting level is 0, it returns a string when '"' comes.
            if (this.#nestCount === 0 && this.#hasValue) {
              yield parse(this.#targetString + string.slice(sliceStart, i + 1));
              this.#hasValue = false;
              this.#targetString = "";
              sliceStart = i + 1;
            }
          }
          this.#escapeNext = !this.#escapeNext && char === "\\";
          continue;
        }

        // Parses number, true, false, null with a nesting level of 0.
        // example: 'null["foo"]' => null, ["foo"]
        // example: 'false{"foo": "bar"}' => null, {foo: "bar"}
        if (
          this.#hasValue && this.#nestCount === 0 &&
          (char === "{" || char === "[" || char === '"' || char === " ")
        ) {
          yield parse(this.#targetString + string.slice(sliceStart, i));
          this.#hasValue = false;
          this.#readingString = false;
          this.#targetString = "";
          sliceStart = i;
          i--;
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
        }

        // parse object or array
        if (
          this.#hasValue && this.#nestCount === 0 &&
          (char === "}" || char === "]")
        ) {
          yield parse(this.#targetString + string.slice(sliceStart, i + 1));
          this.#hasValue = false;
          this.#targetString = "";
          sliceStart = i + 1;
          continue;
        }

        if (!this.#hasValue && !isBrankChar(char)) {
          // We want to ignore the character string with only blank, so if there is a character other than blank, record it.
          this.#hasValue = true;
        }
      }
      this.#targetString += string.slice(sliceStart);
    }
    if (this.#hasValue) {
      yield parse(this.#targetString);
    }
  }
}

/**
 * stream to stringify JSONLines.
 *
 * ```ts
 * import { readableStreamFromIterable } from "https://deno.land/std@0.138.0/streams/mod.ts";
 * import { JSONLinesStringifyStream } from "https://deno.land/x/jsonlines@v1.0.0/mod.ts";
 *
 * const file = await Deno.open(new URL("./tmp.concat-json", import.meta.url), {
 *   create: true,
 *   write: true,
 * });
 *
 * readableStreamFromIterable([{ foo: "bar" }, { baz: 100 }])
 *   .pipeThrough(new JSONLinesStringifyStream())
 *   .pipeThrough(new TextEncoderStream())
 *   .pipeTo(file.writable)
 *   .then(() => console.log("write success"));
 * ```
 *
 * @param options
 * @param options.separator a character to separate JSON. The default is '\n'.
 * @param options.writableStrategy Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream.
 * @param options.readableStrategy Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream.
 */
export class JSONLinesStringifyStream extends TransformStream<unknown, string> {
  constructor(options: StringifyStreamOptions = {}) {
    const { separator = "\n", writableStrategy, readableStrategy } = options;
    const [prefix, suffix] = separator.includes("\n")
      ? ["", separator]
      : [separator, "\n"];
    super(
      {
        transform(chunk, controller) {
          controller.enqueue(`${prefix}${JSON.stringify(chunk)}${suffix}`);
        },
      },
      writableStrategy,
      readableStrategy,
    );
  }
}

/**
 * stream to stringify concatenated JSON.
 *
 * ```ts
 * import { readableStreamFromIterable } from "https://deno.land/std@0.138.0/streams/mod.ts";
 * import { ConcatenatedJSONStringifyStream } from "https://deno.land/x/jsonlines@v1.0.0/mod.ts";
 *
 * const file = await Deno.open(new URL("./tmp.concat-json", import.meta.url), {
 *   create: true,
 *   write: true,
 * });
 *
 * readableStreamFromIterable([{ foo: "bar" }, { baz: 100 }])
 *   .pipeThrough(new ConcatenatedJSONStringifyStream())
 *   .pipeThrough(new TextEncoderStream())
 *   .pipeTo(file.writable)
 *   .then(() => console.log("write success"));
 * ```
 *
 * @param options
 * @param options.separator This parameter will be ignored.
 * @param options.writableStrategy Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream.
 * @param options.readableStrategy Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream.
 */
export class ConcatenatedJSONStringifyStream extends JSONLinesStringifyStream {
  constructor(options: StringifyStreamOptions = {}) {
    const { writableStrategy, readableStrategy } = options;
    super({ separator: "\n", writableStrategy, readableStrategy });
  }
}

/** JSON.parse with detailed error message */
function parse(text: string) {
  try {
    return JSON.parse(text) as JSONValue;
  } catch (error: unknown) {
    if (error instanceof Error) {
      // Truncate the string so that it is within 30 lengths.
      const truncatedText = 30 < text.length ? `${text.slice(0, 30)}...` : text;
      throw new (error.constructor as ErrorConstructor)(
        `${error.message} (parsing: '${truncatedText}')`,
      );
    }
    throw error;
  }
}

const blank = new Set(" \t\r\n");
function isBrankChar(char: string) {
  return blank.has(char);
}
