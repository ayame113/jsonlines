import { assertEquals, assertRejects } from "https://deno.land/std@0.138.0/testing/asserts.ts";
import { ConcatenatedJSONStream, JSONLinesStream } from "./mod.js";
async function assertValidParse(transform, chunks, expect, options) {
    const r = new ReadableStream({
        start (controller) {
            for (const chunk of chunks){
                controller.enqueue(chunk);
            }
            controller.close();
        }
    });
    const res = [];
    for await (const data of r.pipeThrough(new transform(options))){
        res.push(data);
    }
    assertEquals(res, expect);
}
async function assertInvalidParse(transform, chunks, options, // deno-lint-ignore no-explicit-any
ErrorClass, msgIncludes) {
    const r = new ReadableStream({
        start (controller) {
            for (const chunk of chunks){
                controller.enqueue(chunk);
            }
            controller.close();
        }
    });
    await assertRejects(async ()=>{
        for await (const _ of r.pipeThrough(new transform(options)));
    }, ErrorClass, msgIncludes);
}
Deno.test({
    name: "concatenated",
    async fn () {
        await assertValidParse(ConcatenatedJSONStream, [
            "0"
        ], [
            0
        ]);
        await assertValidParse(ConcatenatedJSONStream, [
            "100"
        ], [
            100
        ]);
        await assertValidParse(ConcatenatedJSONStream, [
            '100 200 {"foo": "bar"}'
        ], [
            100,
            200,
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(ConcatenatedJSONStream, [
            '"foo"'
        ], [
            "foo"
        ]);
        await assertValidParse(ConcatenatedJSONStream, [
            '"foo""bar"{"foo": "bar"}'
        ], [
            "foo",
            "bar",
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(ConcatenatedJSONStream, [
            '{"foo": "bar"}'
        ], [
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(ConcatenatedJSONStream, [
            '{"foo": "bar"} '
        ], [
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(ConcatenatedJSONStream, [
            ' {"foo": "bar"}'
        ], [
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(ConcatenatedJSONStream, [
            '[{"foo": "bar"}]'
        ], [
            [
                {
                    foo: "bar"
                }
            ]
        ]);
        await assertValidParse(ConcatenatedJSONStream, [
            '{"foo": "bar"}{"foo": "bar"}'
        ], [
            {
                foo: "bar"
            },
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(ConcatenatedJSONStream, [
            '{"foo": "bar"} {"foo": "bar"}'
        ], [
            {
                foo: "bar"
            },
            {
                foo: "bar"
            }
        ]);
    }
});
Deno.test({
    name: "concatenated: chunk",
    async fn () {
        await assertValidParse(ConcatenatedJSONStream, [
            "",
            '{"foo": "bar"}'
        ], [
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(ConcatenatedJSONStream, [
            "{",
            '"foo": "bar"}'
        ], [
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(ConcatenatedJSONStream, [
            '{"foo": "b',
            'ar"}'
        ], [
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(ConcatenatedJSONStream, [
            '{"foo": "bar"',
            "}"
        ], [
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(ConcatenatedJSONStream, [
            '{"foo": "bar"}',
            ""
        ], [
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(ConcatenatedJSONStream, [
            '{"foo": "bar"}',
            '{"foo": "bar"}'
        ], [
            {
                foo: "bar"
            },
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(ConcatenatedJSONStream, [
            '{"foo": "bar"',
            '}{"foo": "bar"}'
        ], [
            {
                foo: "bar"
            },
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(ConcatenatedJSONStream, [
            '{"foo": "bar"}{',
            '"foo": "bar"}'
        ], [
            {
                foo: "bar"
            },
            {
                foo: "bar"
            }
        ]);
    }
});
Deno.test({
    name: "concatenated: surrogate pair",
    async fn () {
        await assertValidParse(ConcatenatedJSONStream, [
            '{"foo": "👪"}{"foo": "👪"}'
        ], [
            {
                foo: "👪"
            },
            {
                foo: "👪"
            }
        ]);
    }
});
Deno.test({
    name: "concatenated: halfway chunk",
    async fn () {
        await assertInvalidParse(ConcatenatedJSONStream, [
            '{"foo": "bar"} {"foo": '
        ], {
        }, SyntaxError, `Unexpected end of JSON input (parsing: ' {"foo": ')`);
    }
});
Deno.test({
    name: "separator",
    async fn () {
        await assertValidParse(JSONLinesStream, [
            '{"foo": "bar"}'
        ], [
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(JSONLinesStream, [
            '{"foo": "bar"}\n'
        ], [
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(JSONLinesStream, [
            '{"foo": "bar"}\r\n'
        ], [
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(JSONLinesStream, [
            '\n{"foo": "bar"}\n'
        ], [
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(JSONLinesStream, [
            "[0]\n"
        ], [
            [
                0
            ]
        ]);
        await assertValidParse(JSONLinesStream, [
            "0\n"
        ], [
            0
        ]);
    }
});
Deno.test({
    name: "separator: chunk",
    async fn () {
        await assertValidParse(JSONLinesStream, [
            "{",
            '"foo": "bar"}\n'
        ], [
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(JSONLinesStream, [
            '{"foo',
            '": "bar"}\n'
        ], [
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(JSONLinesStream, [
            '{"foo":',
            ' "bar"}\n'
        ], [
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(JSONLinesStream, [
            '{"foo": "bar"',
            "}\n"
        ], [
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(JSONLinesStream, [
            '{"foo": "bar"}',
            "\n"
        ], [
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(JSONLinesStream, [
            '{"foo": "bar"}\n',
            ""
        ], [
            {
                foo: "bar"
            }
        ]);
    }
});
Deno.test({
    name: "separator: special separator",
    async fn () {
        {
            const separator = "\x1E";
            await assertValidParse(JSONLinesStream, [
                `${separator}{"foo": "bar"}${separator}{"foo": "bar"}${separator}`
            ], [
                {
                    foo: "bar"
                },
                {
                    foo: "bar"
                }
            ], {
                separator
            });
        }
        {
            const separator = "👪";
            await assertValidParse(JSONLinesStream, [
                `${separator}{"foo": "bar"}${separator}{"foo": "bar"}${separator}`
            ], [
                {
                    foo: "bar"
                },
                {
                    foo: "bar"
                }
            ], {
                separator
            });
        }
    }
});
Deno.test({
    name: "separator: empty line",
    async fn () {
        await assertValidParse(JSONLinesStream, [
            '{"foo": "bar"} \n {"foo": "bar"} \n'
        ], [
            {
                foo: "bar"
            },
            {
                foo: "bar"
            }
        ]);
        await assertValidParse(JSONLinesStream, [
            '{"foo": "bar"} \n\n {"foo": "bar"}'
        ], [
            {
                foo: "bar"
            },
            {
                foo: "bar"
            }
        ]);
    }
});
Deno.test({
    name: "separator: surrogate pair",
    async fn () {
        await assertValidParse(JSONLinesStream, [
            '{"foo": "👪"}\n{"foo": "👪"}\n'
        ], [
            {
                foo: "👪"
            },
            {
                foo: "👪"
            }
        ]);
    }
});
Deno.test({
    name: "separator: invalid line break",
    async fn () {
        await assertInvalidParse(JSONLinesStream, [
            '{"foo": \n "bar"} \n {"foo": \n "bar"}'
        ], {
        }, SyntaxError, `Unexpected end of JSON input (parsing: '{"foo": ')`);
    }
});
Deno.test({
    name: "separator: halfway chunk",
    async fn () {
        await assertInvalidParse(JSONLinesStream, [
            '{"foo": "bar"} \n {"foo": '
        ], {
        }, SyntaxError, `Unexpected end of JSON input (parsing: ' {"foo": ')`);
    }
});
Deno.test({
    name: "separator: invalid separator",
    async fn () {
        const separator = "aa";
        await assertInvalidParse(JSONLinesStream, [
            `{"foo": "bar"}${separator}{"foo": "bar"}`
        ], {
            separator
        }, Error, "The separator length should be 1, but it was 2.");
    }
});
