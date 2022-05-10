import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.138.0/testing/asserts.ts";
import { readableStreamFromIterable } from "https://deno.land/std@0.138.0/streams/conversion.ts";
import {
  ConcatenatedJSONParseStream,
  ConcatenatedJSONStringifyStream,
  JSONLinesParseStream,
  JSONLinesStringifyStream,
  JSONValue,
  ParseStreamOptions,
  StringifyStreamOptions,
  transformStreamFromGeneratorFunction,
} from "./mod.ts";

async function assertValidParse(
  transform: typeof ConcatenatedJSONParseStream | typeof JSONLinesParseStream,
  chunks: string[],
  expect: unknown[],
  options?: ParseStreamOptions,
) {
  const r = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  const res = [];
  for await (const data of r.pipeThrough(new transform(options))) {
    res.push(data);
  }
  assertEquals(res, expect);
}

async function assertInvalidParse(
  transform: typeof ConcatenatedJSONParseStream | typeof JSONLinesParseStream,
  chunks: string[],
  options?: ParseStreamOptions,
  // deno-lint-ignore no-explicit-any
  ErrorClass?: (new (...args: any[]) => Error) | undefined,
  msgIncludes?: string | undefined,
) {
  const r = new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  await assertRejects(
    async () => {
      for await (const _ of r.pipeThrough(new transform(options)));
    },
    ErrorClass,
    msgIncludes,
  );
}

async function assertValidStringify(
  transform:
    | typeof ConcatenatedJSONStringifyStream
    | typeof JSONLinesStringifyStream,
  chunks: JSONValue[],
  expect: string[],
  options?: StringifyStreamOptions,
) {
  const r = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  const res = [];
  for await (const data of r.pipeThrough(new transform(options))) {
    res.push(data);
  }
  assertEquals(res, expect);
}

async function assertInvalidStringify(
  transform:
    | typeof ConcatenatedJSONStringifyStream
    | typeof JSONLinesStringifyStream,
  chunks: unknown[],
  options?: StringifyStreamOptions,
  // deno-lint-ignore no-explicit-any
  ErrorClass?: (new (...args: any[]) => Error) | undefined,
  msgIncludes?: string | undefined,
) {
  const r = new ReadableStream<unknown>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  await assertRejects(
    async () => {
      for await (const _ of r.pipeThrough(new transform(options)));
    },
    ErrorClass,
    msgIncludes,
  );
}

Deno.test({
  name: "parse(concatenated)",
  async fn() {
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['{"foo": "bar"}'],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['{"foo": "bar"} '],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      [' {"foo": "bar"}'],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['[{"foo": "bar"}]'],
      [[{ foo: "bar" }]],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['{"foo": "bar"}{"foo": "bar"}'],
      [{ foo: "bar" }, { foo: "bar" }],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['{"foo": "bar"} {"foo": "bar"}'],
      [{ foo: "bar" }, { foo: "bar" }],
    );
  },
});

Deno.test({
  name: "parse(concatenated): primitive",
  async fn() {
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ["0"],
      [0],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ["100"],
      [100],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['100 200"foo"'],
      [100, 200, "foo"],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['100 200{"foo": "bar"}'],
      [100, 200, { foo: "bar" }],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['100 200["foo"]'],
      [100, 200, ["foo"]],
    );

    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['"foo"'],
      ["foo"],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['"foo""bar"{"foo": "bar"}'],
      ["foo", "bar", { foo: "bar" }],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['"foo""bar"["foo"]'],
      ["foo", "bar", ["foo"]],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['"foo""bar"0'],
      ["foo", "bar", 0],
    );

    await assertValidParse(
      ConcatenatedJSONParseStream,
      ["null"],
      [null],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['null null{"foo": "bar"}'],
      [null, null, { foo: "bar" }],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['null null["foo"]'],
      [null, null, ["foo"]],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ["null null 0"],
      [null, null, 0],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['null null"foo"'],
      [null, null, "foo"],
    );

    await assertValidParse(
      ConcatenatedJSONParseStream,
      ["true"],
      [true],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['true true{"foo": "bar"}'],
      [true, true, { foo: "bar" }],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['true true["foo"]'],
      [true, true, ["foo"]],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ["true true 0"],
      [true, true, 0],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['true true"foo"'],
      [true, true, "foo"],
    );

    await assertValidParse(
      ConcatenatedJSONParseStream,
      ["false"],
      [false],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['false false{"foo": "bar"}'],
      [false, false, { foo: "bar" }],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['false false["foo"]'],
      [false, false, ["foo"]],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ["false false 0"],
      [false, false, 0],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['false false"foo"'],
      [false, false, "foo"],
    );
  },
});

Deno.test({
  name: "parse(concatenated): chunk",
  async fn() {
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ["", '{"foo": "bar"}'],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ["{", '"foo": "bar"}'],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['{"foo": "b', 'ar"}'],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['{"foo": "bar"', "}"],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['{"foo": "bar"}', ""],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['{"foo": "bar"}', '{"foo": "bar"}'],
      [{ foo: "bar" }, { foo: "bar" }],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['{"foo": "bar"', '}{"foo": "bar"}'],
      [{ foo: "bar" }, { foo: "bar" }],
    );
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['{"foo": "bar"}{', '"foo": "bar"}'],
      [{ foo: "bar" }, { foo: "bar" }],
    );
  },
});

Deno.test({
  name: "parse(concatenated): surrogate pair",
  async fn() {
    await assertValidParse(
      ConcatenatedJSONParseStream,
      ['{"foo": "👪"}{"foo": "👪"}'],
      [{ foo: "👪" }, { foo: "👪" }],
    );
  },
});

Deno.test({
  name: "parse(concatenated): halfway chunk",
  async fn() {
    await assertInvalidParse(
      ConcatenatedJSONParseStream,
      ['{"foo": "bar"} {"foo": '],
      {},
      SyntaxError,
      `Unexpected end of JSON input (parsing: ' {"foo": ')`,
    );
  },
});

Deno.test({
  name: "parse(concatenated): truncate error message",
  async fn() {
    await assertInvalidParse(
      ConcatenatedJSONParseStream,
      [`{${"foo".repeat(100)}}`],
      {},
      SyntaxError,
      `Unexpected token f in JSON at position 1 (parsing: '{foofoofoofoofoofoofoofoofoofo...')`,
    );
  },
});

Deno.test({
  name: "parse(separator)",
  async fn() {
    await assertValidParse(
      JSONLinesParseStream,
      ['{"foo": "bar"}'],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      JSONLinesParseStream,
      ['{"foo": "bar"}\n'],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      JSONLinesParseStream,
      ['{"foo": "bar"}\r\n'],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      JSONLinesParseStream,
      ['\n{"foo": "bar"}\n'],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      JSONLinesParseStream,
      ["[0]\n"],
      [[0]],
    );
    await assertValidParse(
      JSONLinesParseStream,
      ["0\n"],
      [0],
    );
  },
});

Deno.test({
  name: "parse(separator): chunk",
  async fn() {
    await assertValidParse(
      JSONLinesParseStream,
      ["{", '"foo": "bar"}\n'],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      JSONLinesParseStream,
      ['{"foo', '": "bar"}\n'],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      JSONLinesParseStream,
      ['{"foo":', ' "bar"}\n'],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      JSONLinesParseStream,
      ['{"foo": "bar"', "}\n"],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      JSONLinesParseStream,
      ['{"foo": "bar"}', "\n"],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      JSONLinesParseStream,
      ['{"foo": "bar"}\n', ""],
      [{ foo: "bar" }],
    );
  },
});

Deno.test({
  name: "parse(separator): special separator",
  async fn() {
    const separator = "\x1E";
    await assertValidParse(
      JSONLinesParseStream,
      [`${separator}{"foo": "bar"}${separator}{"foo": "bar"}${separator}`],
      [{ foo: "bar" }, { foo: "bar" }],
      { separator },
    );
  },
});

Deno.test({
  name: "parse(separator): empty line",
  async fn() {
    await assertValidParse(
      JSONLinesParseStream,
      ['{"foo": "bar"} \n {"foo": "bar"} \n'],
      [{ foo: "bar" }, { foo: "bar" }],
    );
    await assertValidParse(
      JSONLinesParseStream,
      ['{"foo": "bar"} \n\n {"foo": "bar"}'],
      [{ foo: "bar" }, { foo: "bar" }],
    );
  },
});

Deno.test({
  name: "parse(separator): surrogate pair",
  async fn() {
    await assertValidParse(
      JSONLinesParseStream,
      ['{"foo": "👪"}\n{"foo": "👪"}\n'],
      [{ foo: "👪" }, { foo: "👪" }],
    );
  },
});

Deno.test({
  name: "parse(separator): invalid line break",
  async fn() {
    await assertInvalidParse(
      JSONLinesParseStream,
      ['{"foo": \n "bar"} \n {"foo": \n "bar"}'],
      {},
      SyntaxError,
      `Unexpected end of JSON input (parsing: '{"foo": ')`,
    );
  },
});

Deno.test({
  name: "parse(separator): halfway chunk",
  async fn() {
    await assertInvalidParse(
      JSONLinesParseStream,
      ['{"foo": "bar"} \n {"foo": '],
      {},
      SyntaxError,
      `Unexpected end of JSON input (parsing: ' {"foo": ')`,
    );
  },
});

Deno.test({
  name: "parse(separator): invalid separator",
  async fn() {
    const separator = "aa";
    await assertInvalidParse(
      JSONLinesParseStream,
      [`{"foo": "bar"}${separator}{"foo": "bar"}`],
      { separator },
      Error,
      "The separator length should be 1, but it was 2.",
    );
    {
      const separator = "👪";
      await assertInvalidParse(
        JSONLinesParseStream,
        [`{"foo": "bar"}${separator}{"foo": "bar"}`],
        { separator },
        Error,
        "The separator length should be 1, but it was 2.",
      );
    }
  },
});

Deno.test({
  name: "stringify(concatenated)",
  async fn() {
    await assertValidStringify(
      ConcatenatedJSONStringifyStream,
      [{ foo: "bar" }, { foo: "bar" }],
      ['{"foo":"bar"}\n', '{"foo":"bar"}\n'],
    );

    const cyclic: Record<string, unknown> = {};
    cyclic.cyclic = cyclic;
    await assertInvalidStringify(
      ConcatenatedJSONStringifyStream,
      [cyclic],
      {},
      TypeError,
      "Converting circular structure to JSON",
    );
  },
});

Deno.test({
  name: "stringify(separator)",
  async fn() {
    await assertValidStringify(
      JSONLinesStringifyStream,
      [{ foo: "bar" }, { foo: "bar" }],
      ['{"foo":"bar"}aaa\n', '{"foo":"bar"}aaa\n'],
      { separator: "aaa\n" },
    );
    await assertValidStringify(
      JSONLinesStringifyStream,
      [{ foo: "bar" }, { foo: "bar" }],
      ['aaa{"foo":"bar"}\n', 'aaa{"foo":"bar"}\n'],
      { separator: "aaa" },
    );
  },
});

Deno.test({
  name: "transformStreamFromGeneratorFunction",
  async fn() {
    const reader = readableStreamFromIterable([0, 1, 2])
      .pipeThrough(transformStreamFromGeneratorFunction(async function* (src) {
        for await (const i of src) {
          yield i * 100;
        }
      }));
    const res = [];
    for await (const i of reader) {
      res.push(i);
    }
    assertEquals(res, [0, 100, 200]);
  },
});

Deno.test({
  name: "transformStreamFromGeneratorFunction: iterable (not async)",
  async fn() {
    const reader = readableStreamFromIterable([0, 1, 2])
      .pipeThrough(transformStreamFromGeneratorFunction(function* (_src) {
        yield 0;
        yield 100;
        yield 200;
      }));
    const res = [];
    for await (const i of reader) {
      res.push(i);
    }
    assertEquals(res, [0, 100, 200]);
  },
});

Deno.test({
  name: "transformStreamFromGeneratorFunction: cancel",
  async fn() {
    let callCount = 0;
    let cancelReason = "";
    const reader = new ReadableStream({
      cancel(reason) {
        callCount++;
        cancelReason = reason;
      },
    }).pipeThrough(transformStreamFromGeneratorFunction(async function* (_) {
      yield 0;
    }));

    await reader.cancel("__reason__");

    assertEquals(callCount, 1);
    assertEquals(cancelReason, "__reason__");
  },
});
