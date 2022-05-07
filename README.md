# jsonlines-web

[![deno module](https://shield.deno.dev/x/jsonlines)](https://deno.land/x/jsonlines)
[![deno doc](https://doc.deno.land/badge.svg)](https://doc.deno.land/https://deno.land/x/jsonlines/mod.ts)
[![npm version](https://badge.fury.io/js/jsonlines-web.svg)](https://badge.fury.io/js/jsonlines-web)
[![ci](https://github.com/ayame113/jsonlines/actions/workflows/ci.yml/badge.svg)](https://github.com/ayame113/jsonlines/actions)
[![codecov](https://codecov.io/gh/ayame113/jsonlines/branch/main/graph/badge.svg?token=GsQ5af4QLn)](https://codecov.io/gh/ayame113/jsonlines)

Web stream based jsonlines decoder/encoder

- ✅Deno
- ✅browser
- ✅Node.js

This library supports JSON in the following formats:

- Line-delimited JSON (JSONLinesStream)
  - NDJSON
  - JSON lines
- Record separator-delimited JSON (JSONLinesStream)
- Concatenated JSON (ConcatenatedJSONStream)

See [wikipedia](https://en.wikipedia.org/wiki/JSON_streaming) for the use of
each JSON.

## install or import

##### Deno

https://deno.land/x/jsonlines/
https://doc.deno.land/https://deno.land/x/jsonlines/mod.ts

```ts
import {
  ConcatenatedJSONStream,
  JSONLinesStream,
} from "https://deno.land/x/jsonlines@v0.0.7/mod.ts";
```

##### browser

```ts
import {
  ConcatenatedJSONStream,
  JSONLinesStream,
} from "https://deno.land/x/jsonlines@v0.0.7/js/mod.js";
```

##### Node.js

https://www.npmjs.com/package/jsonlines-web

```shell
npm install jsonlines-web
```

```js
import { ConcatenatedJSONStream, JSONLinesStream } from "jsonlines-web";
// if you need
// import { TextDecoderStream } from "node:stream/web";
// import { fetch } from "undici";
```

## Usage

A working example can be found at [./testdata/test.ts](./testdata/test.ts).

##### How to parse JSON Lines

./json-lines.jsonl

```json
{"some":"thing"}
{"foo":17,"bar":false,"quux":true}
{"may":{"include":"nested","objects":["and","arrays"]}}
```

```ts
import { JSONLinesStream } from "https://deno.land/x/jsonlines@v0.0.7/mod.ts";

const { body } = await fetch(
  "https://deno.land/x/jsonlines@v0.0.7/testdata/json-lines.jsonl",
);

const readable = body!
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new JSONLinesStream());

for await (const data of readable) {
  console.log(data);
}
```

##### How to parse json-seq

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
import { JSONLinesStream } from "https://deno.land/x/jsonlines@v0.0.7/mod.ts";

const { body } = await fetch(
  "https://deno.land/x/jsonlines@v0.0.7/testdata/json-seq.json-seq",
);

const recordSeparator = "\x1E";
const readable = body!
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new JSONLinesStream({ separator: recordSeparator }));

for await (const data of readable) {
  console.log(data);
}
```

##### How to parse concat-json

./concat-json.concat-json

```json
{"foo":"bar"}{"qux":"corge"}{"baz":{"waldo":"thud"}}
```

```ts
import { ConcatenatedJSONStream } from "https://deno.land/x/jsonlines@v0.0.7/mod.ts";

const { body } = await fetch(
  "https://deno.land/x/jsonlines@v0.0.7/testdata/concat-json.concat-json",
);

const readable = body!
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new ConcatenatedJSONStream());

for await (const data of readable) {
  console.log(data);
}
```

## limit

When parsing concat-json, it cannot be parsed unless it is blank immediately
after the number, null, true and false.

In other words, this cannot be parsed:

```json
100 200{"foo": "bar"}
```

But this can be parsed:

```json
100 200 {"foo": "bar"}
```

## note

This library contains
[ReadableStream.prototype[Symbol.asyncIterator]](https://github.com/whatwg/streams/issues/778)
polyfills. Importing this library will automatically enable
ReadableStream.prototype[Symbol.asyncIterator].

## develop

need to manually `deno task transpile` before release.
