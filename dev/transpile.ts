import { transform } from "https://deno.land/x/swc@0.1.4/mod.ts";

function tsToJs(content: string) {
  return transform(content, {
    // minify: true,
    jsc: {
      target: "es2021",
      parser: {
        syntax: "typescript",
      },
    },
    // deno-lint-ignore no-explicit-any
  } as any).code;
}
{
  const ts = await Deno.readTextFile(new URL("../mod.ts", import.meta.url));
  const js = tsToJs(ts);
  await Deno.writeTextFile(new URL("../js/mod.js", import.meta.url), js, {
    create: true,
  });
}
{
  const ts = await Deno.readTextFile(
    new URL("../mod_test.ts", import.meta.url),
  );
  const js = tsToJs(ts).replaceAll("./mod.ts", "./mod.js");
  await Deno.writeTextFile(new URL("../js/mod_test.js", import.meta.url), js, {
    create: true,
  });
}
