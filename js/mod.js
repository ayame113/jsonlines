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
        const delimiterStream = new TextDelimiterStream(separator);
        const jsonParserStream = new TransformStream({
            transform: this.#separatorDelimitedJSONParser
        }, writableStrategy, readableStrategy);
        this.writable = delimiterStream.writable;
        this.readable = delimiterStream.readable.pipeThrough(jsonParserStream);
    }
    #separatorDelimitedJSONParser = (chunk, controller)=>{
        if (!isBrankString(chunk)) {
            controller.enqueue(parse(chunk));
        }
    };
}
class ConcatenatedJSONParseStream {
    writable;
    readable;
    constructor(options = {}){
        const { writable , readable  } = transformStreamFromGeneratorFunction(this.#concatenatedJSONIterator.bind(this), options.writableStrategy, options.readableStrategy);
        this.writable = writable;
        this.readable = readable;
    }
    #targetString = "";
    #hasValue = false;
    #nestCount = 0;
    #readingString = false;
    #escapeNext = false;
    async *#concatenatedJSONIterator(src) {
        for await (const string of src){
            let sliceStart = 0;
            for(let i = 0; i < string.length; i++){
                const __char = string[i];
                if (this.#readingString) {
                    if (__char === '"' && !this.#escapeNext) {
                        this.#readingString = false;
                        if (this.#nestCount === 0 && this.#hasValue) {
                            yield parse(this.#targetString + string.slice(sliceStart, i + 1));
                            this.#hasValue = false;
                            this.#targetString = "";
                            sliceStart = i + 1;
                        }
                    }
                    this.#escapeNext = !this.#escapeNext && __char === "\\";
                    continue;
                }
                if (this.#hasValue && this.#nestCount === 0 && (__char === "{" || __char === "[" || __char === '"' || __char === " ")) {
                    yield parse(this.#targetString + string.slice(sliceStart, i));
                    this.#hasValue = false;
                    this.#readingString = false;
                    this.#targetString = "";
                    sliceStart = i;
                    i--;
                    continue;
                }
                switch(__char){
                    case '"':
                        this.#readingString = true;
                        this.#escapeNext = false;
                        break;
                    case "{":
                    case "[":
                        this.#nestCount++;
                        break;
                    case "}":
                    case "]":
                        this.#nestCount--;
                        break;
                }
                if (this.#hasValue && this.#nestCount === 0 && (__char === "}" || __char === "]")) {
                    yield parse(this.#targetString + string.slice(sliceStart, i + 1));
                    this.#hasValue = false;
                    this.#targetString = "";
                    sliceStart = i + 1;
                    continue;
                }
                if (!this.#hasValue && !isBrankChar(__char)) {
                    this.#hasValue = true;
                }
            }
            this.#targetString += string.slice(sliceStart);
        }
        if (this.#hasValue) {
            yield parse(this.#targetString);
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
