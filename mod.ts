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

function createStream(
  createDataIterator: (
    src: ReadableStream<string>,
  ) => AsyncIterator<string, void, unknown>,
  { writableStrategy, readableStrategy }: JSONLinesStreamOptions,
) {
  const { writable, readable } = new TransformStream<string, string>(
    {},
    writableStrategy,
    readableStrategy,
  );
  const dataIterator = createDataIterator(readable);
  return {
    writable,
    readable: new ReadableStream<JSONValue>({
      pull: async (controller) => {
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

export class JSONLinesStream implements TransformStream<string, JSONValue> {
  writable: WritableStream<string>;
  readable: ReadableStream<JSONValue>;
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

export class ConcatenatedJSONStream
  implements TransformStream<string, JSONValue> {
  writable: WritableStream<string>;
  readable: ReadableStream<JSONValue>;
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
