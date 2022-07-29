import { fromFileUrl } from "https://deno.land/std@0.149.0/path/mod.ts";
import { build, emptyDir } from "https://deno.land/x/dnt@0.28.0/mod.ts";

const outDir = fromFileUrl(new URL("./npm/", import.meta.url));
const projectRootDir = fromFileUrl(new URL("../", import.meta.url));

await emptyDir(outDir);

await build({
  entryPoints: [`${projectRootDir}/mod.ts`],
  outDir,
  shims: {
    // see JS docs for overview and more options
    deno: true,
    custom: [{
      package: {
        name: "stream/web",
      },
      globalNames: [
        "WritableStream",
        "ReadableStream",
        "TransformStream",
        {
          name: "QueuingStrategy",
          typeOnly: true,
        },
        {
          name: "WritableStreamDefaultWriter",
          typeOnly: true,
        },
        {
          name: "ReadableStreamDefaultReader",
          typeOnly: true,
        },
        {
          name: "TransformStreamDefaultController",
          typeOnly: true,
        },
      ],
    }, {
      module: "util",
      globalNames: [
        "TextEncoder",
        "TextDecoder",
      ],
    }],
  },
  package: {
    // package.json properties
    name: "jsonlines-web",
    version: "v1.2.1",
    description: "Web stream based jsonlines decoder/encoder.",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/ayame113/jsonlines.git",
    },
    bugs: {
      url: "https://github.com/ayame113/jsonlines/issues",
    },
  },
  rootTestDir: projectRootDir,
  testPattern: "mod_test.ts",
});

// post build steps
Deno.copyFileSync(`${projectRootDir}/LICENSE`, `${outDir}/LICENSE`);
Deno.copyFileSync(`${projectRootDir}/README.md`, `${outDir}/README.md`);
