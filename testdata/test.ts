import { ConcatenatedJSONParseStream, JSONLinesParseStream } from "../mod.ts";

Deno.test(async function read_jsonlines() {
  const url = new URL("./json-lines.jsonl", import.meta.url);
  const { body } = await fetch(`${url}`);

  const readable = body!
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new JSONLinesParseStream());

  for await (const data of readable) {
    console.log(data);
  }
});

Deno.test(async function read_ndjson() {
  const url = new URL("./nd-json.ndjson", import.meta.url);
  const { body } = await fetch(`${url}`);

  const readable = body!
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new JSONLinesParseStream());

  for await (const data of readable) {
    console.log(data);
  }
});

Deno.test(async function read_json_seq() {
  const url = new URL("./json-seq.json-seq", import.meta.url);
  const { body } = await fetch(`${url}`);

  const recordSeparator = "\x1E";
  const readable = body!
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new JSONLinesParseStream({ separator: recordSeparator }));

  for await (const data of readable) {
    console.log(data);
  }
});

Deno.test(async function read_concat_json() {
  const url = new URL("./concat-json.concat-json", import.meta.url);
  const { body } = await fetch(`${url}`);

  const readable = body!
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new ConcatenatedJSONParseStream());

  for await (const data of readable) {
    console.log(data);
  }
});
