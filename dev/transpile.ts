import { fromFileUrl } from "https://deno.land/std@0.173.0/path/mod.ts";

const input = fromFileUrl(new URL("../mod.ts", import.meta.url));
const output = fromFileUrl(new URL("../js/mod.js", import.meta.url));
const { success: bundleSuccess } = await Deno.spawn(Deno.execPath(), {
  args: ["bundle", input, output],
  stdout: "inherit",
  stderr: "inherit",
});
if (!bundleSuccess) {
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
const { success: testSuccess } = await Deno.spawn(Deno.execPath(), {
  args: [
    "test",
    testFile,
    `--import-map=data:application/json,${JSON.stringify(importMap)}`,
    "--no-check",
  ],
  stdout: "inherit",
  stderr: "inherit",
});
if (!testSuccess) {
  throw new Error("deno test: failed");
}
