import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.138.0/testing/asserts.ts";
import {
  ConcatenatedJSONParseStream,
  ConcatenatedJSONStringifyStream,
  JSONLinesParseStream,
  JSONLinesStringifyStream,
  JSONValue,
  ParseStreamOptions,
  StringifyStreamOptions,
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
      ['100 200 {"foo": "bar"}'],
      [100, 200, { foo: "bar" }],
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
    {
      const separator = "\x1E";
      await assertValidParse(
        JSONLinesParseStream,
        [`${separator}{"foo": "bar"}${separator}{"foo": "bar"}${separator}`],
        [{ foo: "bar" }, { foo: "bar" }],
        { separator },
      );
    }
    {
      const separator = "👪";
      await assertValidParse(
        JSONLinesParseStream,
        [`${separator}{"foo": "bar"}${separator}{"foo": "bar"}${separator}`],
        [{ foo: "bar" }, { foo: "bar" }],
        { separator },
      );
    }
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
