import { fromFileUrl } from "https://deno.land/std@0.185.0/path/mod.ts";

const input = fromFileUrl(new URL("../mod.ts", import.meta.url));
const output = fromFileUrl(new URL("../js/mod.js", import.meta.url));
const command = new Deno.Command(Deno.execPath(), {
  args: ["bundle", input, output],
  stdout: "inherit",
  stderr: "inherit",
});
const { success: bundleSuccess } = await command.output();
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
const command2 = new Deno.Command(Deno.execPath(), {
  args: [
    "test",
    testFile,
    `--import-map=data:application/json,${JSON.stringify(importMap)}`,
    "--no-check",
  ],
  stdout: "inherit",
  stderr: "inherit",
});
const { success: testSuccess } = await command2.output();
if (!testSuccess) {
  throw new Error("deno test: failed");
}
