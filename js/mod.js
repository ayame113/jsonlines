// deno-fmt-ignore-file
// deno-lint-ignore-file
// This code was bundled using `deno bundle` and it's not recommended to edit it manually

if (typeof ReadableStream.prototype[Symbol.asyncIterator] !== "function") {
    ReadableStream.prototype[Symbol.asyncIterator] = async function*() {
        const reader = this.getReader();
        try {
            while(true){
                const { done , value  } = await reader.read();
                if (done) return;
                yield value;
            }
        } finally{
            reader.releaseLock();
        }
    };
}
function transformStreamFromGeneratorFunction(transformer, writableStrategy, readableStrategy) {
    const { writable , readable ,  } = new TransformStream(undefined, writableStrategy);
    const iterable = transformer(readable);
    const iterator = iterable[Symbol.asyncIterator]?.() ?? iterable[Symbol.iterator]?.();
    return {
        writable,
        readable: new ReadableStream({
            async pull (controller) {
                const { done , value  } = await iterator.next();
                if (done) {
                    controller.close();
                    return;
                }
                controller.enqueue(value);
            },
            async cancel (...args) {
                await readable.cancel(...args);
            }
        }, readableStrategy)
    };
}
"\r".charCodeAt(0);
"\n".charCodeAt(0);
class TextDelimiterStream extends TransformStream {
    #buf = "";
    #delimiter;
    #inspectIndex = 0;
    #matchIndex = 0;
    #delimLPS;
    constructor(delimiter){
        super({
            transform: (chunk5, controller7)=>{
                this.#handle(chunk5, controller7);
            },
            flush: (controller8)=>{
                controller8.enqueue(this.#buf);
            }
        });
        this.#delimiter = delimiter;
        this.#delimLPS = createLPS(new TextEncoder().encode(delimiter));
    }
     #handle(chunk6, controller9) {
        this.#buf += chunk6;
        let localIndex = 0;
        while(this.#inspectIndex < this.#buf.length){
            if (chunk6[localIndex] === this.#delimiter[this.#matchIndex]) {
                this.#inspectIndex++;
                localIndex++;
                this.#matchIndex++;
                if (this.#matchIndex === this.#delimiter.length) {
                    const matchEnd = this.#inspectIndex - this.#delimiter.length;
                    const readyString = this.#buf.slice(0, matchEnd);
                    controller9.enqueue(readyString);
                    this.#buf = this.#buf.slice(this.#inspectIndex);
                    this.#inspectIndex = 0;
                    this.#matchIndex = 0;
                }
            } else {
                if (this.#matchIndex === 0) {
                    this.#inspectIndex++;
                    localIndex++;
                } else {
                    this.#matchIndex = this.#delimLPS[this.#matchIndex - 1];
                }
            }
        }
    }
}
function createLPS(pat) {
    const lps = new Uint8Array(pat.length);
    lps[0] = 0;
    let prefixEnd = 0;
    let i = 1;
    while(i < lps.length){
        if (pat[i] == pat[prefixEnd]) {
            prefixEnd++;
            lps[i] = prefixEnd;
            i++;
        } else if (prefixEnd === 0) {
            lps[i] = 0;
            i++;
        } else {
            prefixEnd = lps[prefixEnd - 1];
        }
    }
    return lps;
}
class JSONLinesParseStream {
    writable;
    readable;
    constructor({ separator ="\n" , writableStrategy , readableStrategy  } = {}){
        const { writable , readable  } = new TextDelimiterStream(separator);
        this.writable = writable;
        this.readable = readable.pipeThrough(new TransformStream({
            transform (chunk, controller) {
                if (!isBrankString(chunk)) {
                    controller.enqueue(parse(chunk));
                }
            }
        }, writableStrategy, readableStrategy));
    }
}
class ConcatenatedJSONParseStream {
    writable;
    readable;
    constructor(options = {}){
        const { writable , readable  } = transformStreamFromGeneratorFunction(this.#concatenatedJSONIterator, options.writableStrategy, options.readableStrategy);
        this.writable = writable;
        this.readable = readable;
    }
    async *#concatenatedJSONIterator(src) {
        let targetString = "";
        let hasValue = false;
        let nestCount = 0;
        let readingString = false;
        let escapeNext = false;
        for await (const string of src){
            let sliceStart = 0;
            for(let i = 0; i < string.length; i++){
                const __char = string[i];
                if (readingString) {
                    if (__char === '"' && !escapeNext) {
                        readingString = false;
                        if (nestCount === 0 && hasValue) {
                            yield parse(targetString + string.slice(sliceStart, i + 1));
                            hasValue = false;
                            targetString = "";
                            sliceStart = i + 1;
                        }
                    }
                    escapeNext = !escapeNext && __char === "\\";
                    continue;
                }
                if (hasValue && nestCount === 0 && (__char === "{" || __char === "[" || __char === '"' || __char === " ")) {
                    yield parse(targetString + string.slice(sliceStart, i));
                    hasValue = false;
                    readingString = false;
                    targetString = "";
                    sliceStart = i;
                    i--;
                    continue;
                }
                switch(__char){
                    case '"':
                        readingString = true;
                        escapeNext = false;
                        break;
                    case "{":
                    case "[":
                        nestCount++;
                        break;
                    case "}":
                    case "]":
                        nestCount--;
                        break;
                }
                if (hasValue && nestCount === 0 && (__char === "}" || __char === "]")) {
                    yield parse(targetString + string.slice(sliceStart, i + 1));
                    hasValue = false;
                    targetString = "";
                    sliceStart = i + 1;
                    continue;
                }
                if (!hasValue && !isBrankChar(__char)) {
                    hasValue = true;
                }
            }
            targetString += string.slice(sliceStart);
        }
        if (hasValue) {
            yield parse(targetString);
        }
    }
}
function parse(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        if (error instanceof Error) {
            const truncatedText = 30 < text.length ? `${text.slice(0, 30)}...` : text;
            throw new error.constructor(`${error.message} (parsing: '${truncatedText}')`);
        }
        throw error;
    }
}
const blank = new Set(" \t\r\n");
function isBrankChar(__char) {
    return blank.has(__char);
}
const branks = /[^ \t\r\n]/;
function isBrankString(str) {
    return !branks.test(str);
}
class JSONLinesStringifyStream extends TransformStream {
    constructor(options = {}){
        const { separator ="\n" , writableStrategy , readableStrategy  } = options;
        const [prefix, suffix] = separator.includes("\n") ? [
            "",
            separator
        ] : [
            separator,
            "\n"
        ];
        super({
            transform (chunk, controller) {
                controller.enqueue(`${prefix}${JSON.stringify(chunk)}${suffix}`);
            }
        }, writableStrategy, readableStrategy);
    }
}
class ConcatenatedJSONStringifyStream extends JSONLinesStringifyStream {
    constructor(options = {}){
        const { writableStrategy , readableStrategy  } = options;
        super({
            separator: "\n",
            writableStrategy,
            readableStrategy
        });
    }
}
export { transformStreamFromGeneratorFunction as transformStreamFromGeneratorFunction };
export { ConcatenatedJSONParseStream as ConcatenatedJSONParseStream, JSONLinesParseStream as JSONLinesParseStream };
export { ConcatenatedJSONStringifyStream as ConcatenatedJSONStringifyStream, JSONLinesStringifyStream as JSONLinesStringifyStream };
