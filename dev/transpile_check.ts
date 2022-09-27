import { assertEquals } from "https://deno.land/std@0.157.0/testing/asserts.ts";
import { fromFileUrl } from "https://deno.land/std@0.157.0/path/mod.ts";

const input = fromFileUrl(new URL("../mod.ts", import.meta.url));
const output = fromFileUrl(new URL("../js/mod.js", import.meta.url));
const { success: bundleSuccess, stdout } = await Deno.spawn(Deno.execPath(), {
  args: ["bundle", input],
  stdout: "piped",
  stderr: "inherit",
});

if (!bundleSuccess) {
  throw new Error("deno bundle: failed");
}

const actual = (await Deno.readTextFile(output)).trim();
const expected = new TextDecoder().decode(stdout).trim();

assertEquals(actual, expected, "please run `deno task bundle` before commit");
