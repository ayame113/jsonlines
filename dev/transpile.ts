import { fromFileUrl } from "https://deno.land/std@0.140.0/path/mod.ts";

const input = fromFileUrl(new URL("../mod.ts", import.meta.url));
const output = fromFileUrl(new URL("../js/mod.js", import.meta.url));
const { status } = await Deno.spawn(Deno.execPath(), {
  args: ["bundle", input, output],
  stdout: "inherit",
  stderr: "inherit",
});
if (!status.success) {
  throw new Error("deno bundle: failed");
}

const importMap = {
  "imports": {
    [`${new URL("../mod.ts", import.meta.url)}`]: `${new URL(
      "../js/mod.js",
      import.meta.url,
    )}`,
  },
};
const testFile = fromFileUrl(new URL("../mod_test.ts", import.meta.url));
const { status: testStatus } = await Deno.spawn(Deno.execPath(), {
  args: [
    "test",
    testFile,
    `--import-map=data:application/json,${JSON.stringify(importMap)}`,
    "--no-check",
  ],
  stdout: "inherit",
  stderr: "inherit",
});
if (!testStatus.success) {
  throw new Error("deno test: failed");
}
