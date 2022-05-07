import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.138.0/testing/asserts.ts";
import { JSONLinesStream, JSONLinesStreamOptions } from "./mod.ts";

async function assertValidParse(
  chunks: string[],
  expect: unknown[],
  options?: JSONLinesStreamOptions,
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
  for await (const data of r.pipeThrough(new JSONLinesStream(options))) {
    res.push(data);
  }
  assertEquals(res, expect);
}
async function assertInvalidParse(
  chunks: string[],
  options?: JSONLinesStreamOptions,
  // deno-lint-ignore no-explicit-any
  ErrorClass?: (new (...args: any[]) => Error) | undefined,
  msgIncludes?: string | undefined,
) {
  const r = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  await assertRejects(
    async () => {
      for await (const _ of r.pipeThrough(new JSONLinesStream(options)));
    },
    ErrorClass,
    msgIncludes,
  );
}

Deno.test({
  name: "concatenated",
  async fn() {
    await assertValidParse(
      ['{"foo": "bar"}'],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      ['{"foo": "bar"} '],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      [' {"foo": "bar"}'],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      ['[{"foo": "bar"}]'],
      [[{ foo: "bar" }]],
    );
    await assertValidParse(
      ['{"foo": "bar"}{"foo": "bar"}'],
      [{ foo: "bar" }, { foo: "bar" }],
    );
    await assertValidParse(
      ['{"foo": "bar"} {"foo": "bar"}'],
      [{ foo: "bar" }, { foo: "bar" }],
    );
  },
});

Deno.test({
  name: "concatenated: chunk",
  async fn() {
    await assertValidParse(
      ["", '{"foo": "bar"}'],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      ["{", '"foo": "bar"}'],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      ['{"foo": "b', 'ar"}'],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      ['{"foo": "bar"', "}"],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      ['{"foo": "bar"}', ""],
      [{ foo: "bar" }],
    );
    await assertValidParse(
      ['{"foo": "bar"}', '{"foo": "bar"}'],
      [{ foo: "bar" }, { foo: "bar" }],
    );
    await assertValidParse(
      ['{"foo": "bar"', '}{"foo": "bar"}'],
      [{ foo: "bar" }, { foo: "bar" }],
    );
    await assertValidParse(
      ['{"foo": "bar"}{', '"foo": "bar"}'],
      [{ foo: "bar" }, { foo: "bar" }],
    );
  },
});

Deno.test({
  name: "concatenated: surrogate pair",
  async fn() {
    await assertValidParse(
      ['{"foo": "👪"}{"foo": "👪"}'],
      [{ foo: "👪" }, { foo: "👪" }],
    );
  },
});

Deno.test({
  name: "concatenated: halfway chunk",
  async fn() {
    await assertInvalidParse(
      ['{"foo": "bar"} {"foo": '],
      {},
      SyntaxError,
      `Unexpected end of JSON input (parsing: ' {"foo": ')`,
    );
  },
});

Deno.test({
  name: "separator",
  async fn() {
    await assertValidParse(
      ['{"foo": "bar"}'],
      [{ foo: "bar" }],
      { separator: "\n" },
    );
    await assertValidParse(
      ['{"foo": "bar"}\n'],
      [{ foo: "bar" }],
      { separator: "\n" },
    );
    await assertValidParse(
      ['{"foo": "bar"}\r\n'],
      [{ foo: "bar" }],
      { separator: "\n" },
    );
    await assertValidParse(
      ["[0]\n"],
      [[0]],
      { separator: "\n" },
    );
    await assertValidParse(
      ["0\n"],
      [0],
      { separator: "\n" },
    );
  },
});

Deno.test({
  name: "separator: chunk",
  async fn() {
    await assertValidParse(
      ["{", '"foo": "bar"}\n'],
      [{ foo: "bar" }],
      { separator: "\n" },
    );
    await assertValidParse(
      ['{"foo', '": "bar"}\n'],
      [{ foo: "bar" }],
      { separator: "\n" },
    );
    await assertValidParse(
      ['{"foo":', ' "bar"}\n'],
      [{ foo: "bar" }],
      { separator: "\n" },
    );
    await assertValidParse(
      ['{"foo": "bar"', "}\n"],
      [{ foo: "bar" }],
      { separator: "\n" },
    );
    await assertValidParse(
      ['{"foo": "bar"}', "\n"],
      [{ foo: "bar" }],
      { separator: "\n" },
    );
    await assertValidParse(
      ['{"foo": "bar"}\n', ""],
      [{ foo: "bar" }],
      { separator: "\n" },
    );
  },
});

Deno.test({
  name: "separator: special separator",
  async fn() {
    const recordSeparator = "\x1E";
    await assertValidParse(
      [`{"foo": "bar"}${recordSeparator}{"foo": "bar"}`],
      [{ foo: "bar" }, { foo: "bar" }],
      { separator: recordSeparator },
    );

    const surrogatePairSeparator = "👪";
    await assertValidParse(
      [`{"foo": "bar"}${surrogatePairSeparator}{"foo": "bar"}`],
      [{ foo: "bar" }, { foo: "bar" }],
      { separator: surrogatePairSeparator },
    );
  },
});

Deno.test({
  name: "separator: empty line",
  async fn() {
    await assertValidParse(
      ['{"foo": "bar"} \n {"foo": "bar"} \n'],
      [{ foo: "bar" }, { foo: "bar" }],
      { separator: "\n" },
    );
    await assertValidParse(
      ['{"foo": "bar"} \n\n {"foo": "bar"}'],
      [{ foo: "bar" }, { foo: "bar" }],
      { separator: "\n" },
    );
  },
});

Deno.test({
  name: "separator: surrogate pair",
  async fn() {
    await assertValidParse(
      ['{"foo": "👪"}\n{"foo": "👪"}\n'],
      [{ foo: "👪" }, { foo: "👪" }],
      { separator: "\n" },
    );
  },
});

Deno.test({
  name: "separator: invalid line break",
  async fn() {
    await assertInvalidParse(
      ['{"foo": \n "bar"} \n {"foo": \n "bar"}'],
      { separator: "\n" },
      SyntaxError,
      `Unexpected end of JSON input (parsing: '{"foo": ')`,
    );
  },
});

Deno.test({
  name: "separator: halfway chunk",
  async fn() {
    await assertInvalidParse(
      ['{"foo": "bar"} \n {"foo": '],
      { separator: "\n" },
      SyntaxError,
      `Unexpected end of JSON input (parsing: ' {"foo": ')`,
    );
  },
});

Deno.test({
  name: "separator: invalid separator",
  async fn() {
    const separator = "aa";
    await assertInvalidParse(
      [`{"foo": "bar"}${separator}{"foo": "bar"}`],
      { separator },
      Error,
      "The separator length should be 1, but it was 2.",
    );
  },
});
