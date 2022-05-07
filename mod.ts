export type JSONValue =
  | { [key: string]: JSONValue }
  | JSONValue[]
  | string
  | number
  | boolean;

export interface JSONLinesStreamOptions {
  separator?: string;
  writableStrategy?: QueuingStrategy<string>;
  readableStrategy?: QueuingStrategy<JSONValue>;
}

export class JSONLinesStream implements TransformStream {
  writable: WritableStream<string>;
  readable: ReadableStream<JSONValue>;
  #dataIterator: AsyncGenerator<string, void, unknown>;
  constructor(options: JSONLinesStreamOptions = {}) {
    const { writable, readable } = new TransformStream<string, string>(
      {},
      options.writableStrategy,
      options.readableStrategy,
    );
    this.writable = writable;
    this.readable = new ReadableStream({
      pull: async (controller) => {
        const { done, value } = await this.#dataIterator.next();
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
    });
    this.#dataIterator = options.separator
      ? this.#separatorDelimitedJSONJSONIterator(readable, options.separator)
      : this.#concatenatedJSONIterator(readable);
  }
  #targetString = "";
  #hasValue = false;
  #blank = new Set(" \t\r\n");
  // separator-delimited JSON
  async *#separatorDelimitedJSONJSONIterator(
    src: ReadableStream<string>,
    separator: string,
  ) {
    if (count(separator) !== 1) {
      throw new Error(
        `The separator length should be 1, but it was ${count(separator)}.`,
      );
    }
    for await (const string of src) {
      let sliceStart = 0;
      let i = -1;
      for (const char of string) {
        i += char.length;
        if (char === separator && this.#hasValue) {
          yield this.#targetString +
            string.slice(sliceStart, i + 1 - char.length);
          this.#hasValue = false;
          this.#targetString = "";
          sliceStart = i + 1;
        } else if (!this.#hasValue && !this.#blank.has(char)) {
          this.#hasValue = true;
        }
      }
      this.#targetString += string.slice(sliceStart);
    }
    if (this.#hasValue) {
      yield this.#targetString;
    }
  }
  // Concatenated JSON parser
  #nestCount = 0;
  #readingString = false;
  #escapeNext = false;
  async *#concatenatedJSONIterator(src: ReadableStream<string>) {
    for await (const string of src) {
      let sliceStart = 0;
      let i = -1;
      for (const char of string) {
        i += char.length;
        if (this.#readingString) {
          if (char === '"' && !this.#escapeNext) {
            this.#readingString = false;
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
        if (this.#nestCount === 0 && this.#hasValue) {
          yield this.#targetString + string.slice(sliceStart, i + 1);
          this.#hasValue = false;
          this.#targetString = "";
          sliceStart = i + 1;
        } else if (!this.#hasValue && !this.#blank.has(char)) {
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

function count(iterator: Iterable<unknown>) {
  let count = 0;
  for (const _ of iterator) {
    count++;
  }
  return count;
}
