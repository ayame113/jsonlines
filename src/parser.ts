import { TextDelimiterStream } from "https://deno.land/std@0.138.0/streams/delimiter.ts";
import { JSONValue, transformStreamFromGeneratorFunction } from "./utils.ts";

// implemented to be streamed as:
// WritableStream -> ReadableStream(1) -> AsyncIterator -> ReadableStream(2)
// ReadableStream(2).pull called, then call AsyncIterator.next.
// AsyncIterator.next called, then call ReadableStream(1).pull.
// ReadableStream(1) and WritableStream are buffered by TransformStream.

// avoid dnt typecheck error
type _QueuingStrategy<T> = QueuingStrategy<T | undefined>;

export interface ParseStreamOptions {
  /**a character to separate JSON. The character length must be 1. The default is '\n'. */
  readonly separator?: string;
  /** Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream. */
  readonly writableStrategy?: _QueuingStrategy<string>;
  /** Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream. */
  readonly readableStrategy?: _QueuingStrategy<JSONValue>;
}

/**
 * stream to parse JSONLines.
 *
 * ```ts
 * import { JSONLinesParseStream } from "https://deno.land/x/jsonlines@v1.1.0/mod.ts";
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
 */
export class JSONLinesParseStream
  implements TransformStream<string, JSONValue> {
  readonly writable: WritableStream<string>;
  readonly readable: ReadableStream<JSONValue>;
  /**
   * @param options
   * @param options.separator a character to separate JSON. The character length must be 1. The default is '\n'.
   * @param options.writableStrategy Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream.
   * @param options.readableStrategy Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream.
   */
  constructor({
    separator = "\n",
    writableStrategy,
    readableStrategy,
  }: ParseStreamOptions = {}) {
    const delimiterStream = new TextDelimiterStream(separator);
    const jsonParserStream = new TransformStream(
      {
        transform: this.#separatorDelimitedJSONParser,
      },
      writableStrategy,
      readableStrategy,
    );

    this.writable = delimiterStream.writable;
    this.readable = delimiterStream.readable.pipeThrough(jsonParserStream);
  }

  #separatorDelimitedJSONParser = (
    chunk: string,
    controller: TransformStreamDefaultController<JSONValue>,
  ) => {
    if (!isBrankString(chunk)) {
      controller.enqueue(parse(chunk));
    }
  };
}

/**
 * stream to parse concatenated JSON.
 *
 * ```ts
 * import { ConcatenatedJSONParseStream } from "https://deno.land/x/jsonlines@v1.1.0/mod.ts";
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
 */
export class ConcatenatedJSONParseStream
  implements TransformStream<string, JSONValue> {
  readonly writable: WritableStream<string>;
  readonly readable: ReadableStream<JSONValue>;
  /**
   * @param options
   * @param options.separator This parameter will be ignored.
   * @param options.writableStrategy Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream.
   * @param options.readableStrategy Controls the buffer of the TransformStream used internally. Check https://developer.mozilla.org/en-US/docs/Web/API/TransformStream/TransformStream.
   */
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

const branks = /[^ \t\r\n]/;
function isBrankString(str: string) {
  return !branks.test(str);
}
