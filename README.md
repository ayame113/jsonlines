# jsonlines

Web stream based jsonlines decoder/encoder

- ✅browser
- ✅Deno
- ✅Node.js

##### How to parse JSON Lines

./json-lines.jsonl

```json
{"some":"thing"}
{"foo":17,"bar":false,"quux":true}
{"may":{"include":"nested","objects":["and","arrays"]}}
```

```ts
import { JSONLinesStream } from "./mod.ts";

const url = new URL("./json-lines.jsonl", import.meta.url);
const { body } = await fetch(`${url}`);

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
import { JSONLinesStream } from "./mod.ts";

const url = new URL("./json-seq.json-seq", import.meta.url);
const { body } = await fetch(`${url}`);

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
import { ConcatenatedJSONStream } from "./mod.ts";

const url = new URL("./concat-json.concat-json", import.meta.url);
const { body } = await fetch(`${url}`);

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
