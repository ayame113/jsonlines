# jsonlines-web

[![deno module](https://shield.deno.dev/x/jsonlines)](https://deno.land/x/jsonlines)
[![deno doc](https://doc.deno.land/badge.svg)](https://doc.deno.land/https://deno.land/x/jsonlines/mod.ts)
[![npm version](https://badge.fury.io/js/jsonlines-web.svg)](https://badge.fury.io/js/jsonlines-web)
[![ci](https://github.com/ayame113/jsonlines/actions/workflows/ci.yml/badge.svg)](https://github.com/ayame113/jsonlines/actions)
[![codecov](https://codecov.io/gh/ayame113/jsonlines/branch/main/graph/badge.svg?token=GsQ5af4QLn)](https://codecov.io/gh/ayame113/jsonlines)
![GitHub Sponsors](https://img.shields.io/github/sponsors/ayame113)

Web stream based jsonlines decoder/encoder

- ✅Deno
- ✅browser
- ✅Node.js

This library supports JSON in the following formats:

- Line-delimited JSON (JSONLinesParseStream)
  - NDJSON
  - JSON lines
- Record separator-delimited JSON (JSONLinesParseStream)
- Concatenated JSON (ConcatenatedJSONParseStream)

See [wikipedia](https://en.wikipedia.org/wiki/JSON_streaming) for the
specifications of each JSON.

## install or import

### Deno

https://deno.land/x/jsonlines/
https://doc.deno.land/https://deno.land/x/jsonlines/mod.ts

```ts
import {
  ConcatenatedJSONParseStream,
  ConcatenatedJSONStringifyStream,
  JSONLinesParseStream,
  JSONLinesStringifyStream,
} from "https://deno.land/x/jsonlines@v1.0.0/mod.ts";
```

### browser

```ts
import {
  ConcatenatedJSONParseStream,
  ConcatenatedJSONStringifyStream,
  JSONLinesParseStream,
  JSONLinesStringifyStream,
} from "https://deno.land/x/jsonlines@v1.0.0/js/mod.js";
```

### Node.js

https://www.npmjs.com/package/jsonlines-web

```shell
npm install jsonlines-web
```

```ts, ignore
import {
  ConcatenatedJSONParseStream,
  ConcatenatedJSONStringifyStream,
  JSONLinesParseStream,
  JSONLinesStringifyStream,
} from "jsonlines-web";
// if you need
// import { TextDecoderStream, TextEncoderStream } from "node:stream/web";
// import { fetch } from "undici";
```

## Usage

A working example can be found at [./testdata/test.ts](./testdata/test.ts).

### How to parse JSON Lines

./json-lines.jsonl

```json
{"some":"thing"}
{"foo":17,"bar":false,"quux":true}
{"may":{"include":"nested","objects":["and","arrays"]}}
```

```ts
import { JSONLinesParseStream } from "https://deno.land/x/jsonlines@v1.0.0/mod.ts";

const { body } = await fetch(
  "https://deno.land/x/jsonlines@v1.0.0/testdata/json-lines.jsonl",
);

const readable = body!
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new JSONLinesParseStream());

for await (const data of readable) {
  console.log(data);
}
```

### How to parse json-seq

./json-seq.json-seq

```json
{"some":"thing\n"}
{
  "may": {
    "include": "nested",
    "objects": [
      "and",
      "arrays"
    ]
  }
}
```

```ts
import { JSONLinesParseStream } from "https://deno.land/x/jsonlines@v1.0.0/mod.ts";

const { body } = await fetch(
  "https://deno.land/x/jsonlines@v1.0.0/testdata/json-seq.json-seq",
);

const recordSeparator = "\x1E";
const readable = body!
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new JSONLinesParseStream({ separator: recordSeparator }));

for await (const data of readable) {
  console.log(data);
}
```

### How to parse concat-json

./concat-json.concat-json

```json
{"foo":"bar"}{"qux":"corge"}{"baz":{"waldo":"thud"}}
```

```ts
import { ConcatenatedJSONParseStream } from "https://deno.land/x/jsonlines@v1.0.0/mod.ts";

const { body } = await fetch(
  "https://deno.land/x/jsonlines@v1.0.0/testdata/concat-json.concat-json",
);

const readable = body!
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new ConcatenatedJSONParseStream());

for await (const data of readable) {
  console.log(data);
}
```

### How to stringify JSON Lines

```ts
import { readableStreamFromIterable } from "https://deno.land/std@0.138.0/streams/mod.ts";
import { JSONLinesStringifyStream } from "https://deno.land/x/jsonlines@v1.0.0/mod.ts";

const file = await Deno.open(new URL("./tmp.concat-json", import.meta.url), {
  create: true,
  write: true,
});

readableStreamFromIterable([{ foo: "bar" }, { baz: 100 }])
  .pipeThrough(new JSONLinesStringifyStream())
  .pipeThrough(new TextEncoderStream())
  .pipeTo(file.writable)
  .then(() => console.log("write success"));
```

### How to stringify json-seq

```ts
import { readableStreamFromIterable } from "https://deno.land/std@0.138.0/streams/mod.ts";
import { JSONLinesStringifyStream } from "https://deno.land/x/jsonlines@v1.0.0/mod.ts";

const recordSeparator = "\x1E";
const file = await Deno.open(new URL("./tmp.concat-json", import.meta.url), {
  create: true,
  write: true,
});

readableStreamFromIterable([{ foo: "bar" }, { baz: 100 }])
  .pipeThrough(new JSONLinesStringifyStream({ separator: recordSeparator }))
  .pipeThrough(new TextEncoderStream())
  .pipeTo(file.writable)
  .then(() => console.log("write success"));
```

### How to stringify concat-json

```ts
import { readableStreamFromIterable } from "https://deno.land/std@0.138.0/streams/mod.ts";
import { ConcatenatedJSONStringifyStream } from "https://deno.land/x/jsonlines@v1.0.0/mod.ts";

const file = await Deno.open(new URL("./tmp.concat-json", import.meta.url), {
  create: true,
  write: true,
});

readableStreamFromIterable([{ foo: "bar" }, { baz: 100 }])
  .pipeThrough(new ConcatenatedJSONStringifyStream())
  .pipeThrough(new TextEncoderStream())
  .pipeTo(file.writable)
  .then(() => console.log("write success"));
```

## note

This library contains
[ReadableStream.prototype[Symbol.asyncIterator]](https://github.com/whatwg/streams/issues/778)
polyfills. Importing this library will automatically enable
ReadableStream.prototype[Symbol.asyncIterator].

## develop

need to manually `deno task transpile` before release.
