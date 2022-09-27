// deno-fmt-ignore-file
// deno-lint-ignore-file
// This code was bundled using `deno bundle` and it's not recommended to edit it manually

if (typeof ReadableStream.prototype[Symbol.asyncIterator] !== "function") {
    Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
        async *value () {
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
        },
        writable: true,
        enumerable: false,
        configurable: true
    });
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
class BytesList {
    #len = 0;
    #chunks = [];
    constructor(){}
    size() {
        return this.#len;
    }
    add(value, start = 0, end = value.byteLength) {
        if (value.byteLength === 0 || end - start === 0) {
            return;
        }
        checkRange(start, end, value.byteLength);
        this.#chunks.push({
            value,
            end,
            start,
            offset: this.#len
        });
        this.#len += end - start;
    }
    shift(n) {
        if (n === 0) {
            return;
        }
        if (this.#len <= n) {
            this.#chunks = [];
            this.#len = 0;
            return;
        }
        const idx = this.getChunkIndex(n);
        this.#chunks.splice(0, idx);
        const [chunk] = this.#chunks;
        if (chunk) {
            const diff = n - chunk.offset;
            chunk.start += diff;
        }
        let offset = 0;
        for (const chunk1 of this.#chunks){
            chunk1.offset = offset;
            offset += chunk1.end - chunk1.start;
        }
        this.#len = offset;
    }
    getChunkIndex(pos) {
        let max = this.#chunks.length;
        let min = 0;
        while(true){
            const i = min + Math.floor((max - min) / 2);
            if (i < 0 || this.#chunks.length <= i) {
                return -1;
            }
            const { offset , start , end  } = this.#chunks[i];
            const len = end - start;
            if (offset <= pos && pos < offset + len) {
                return i;
            } else if (offset + len <= pos) {
                min = i + 1;
            } else {
                max = i - 1;
            }
        }
    }
    get(i) {
        if (i < 0 || this.#len <= i) {
            throw new Error("out of range");
        }
        const idx = this.getChunkIndex(i);
        const { value , offset , start  } = this.#chunks[idx];
        return value[start + i - offset];
    }
    *iterator(start = 0) {
        const startIdx = this.getChunkIndex(start);
        if (startIdx < 0) return;
        const first = this.#chunks[startIdx];
        let firstOffset = start - first.offset;
        for(let i = startIdx; i < this.#chunks.length; i++){
            const chunk = this.#chunks[i];
            for(let j = chunk.start + firstOffset; j < chunk.end; j++){
                yield chunk.value[j];
            }
            firstOffset = 0;
        }
    }
    slice(start, end = this.#len) {
        if (end === start) {
            return new Uint8Array();
        }
        checkRange(start, end, this.#len);
        const result = new Uint8Array(end - start);
        const startIdx = this.getChunkIndex(start);
        const endIdx = this.getChunkIndex(end - 1);
        let written = 0;
        for(let i = startIdx; i < endIdx; i++){
            const chunk = this.#chunks[i];
            const len = chunk.end - chunk.start;
            result.set(chunk.value.subarray(chunk.start, chunk.end), written);
            written += len;
        }
        const last = this.#chunks[endIdx];
        const rest = end - start - written;
        result.set(last.value.subarray(last.start, last.start + rest), written);
        return result;
    }
    concat() {
        const result = new Uint8Array(this.#len);
        let sum = 0;
        for (const { value , start , end  } of this.#chunks){
            result.set(value.subarray(start, end), sum);
            sum += end - start;
        }
        return result;
    }
}
function checkRange(start, end, len) {
    if (start < 0 || len < start || end < 0 || len < end || end < start) {
        throw new Error("invalid range");
    }
}
const CR = "\r".charCodeAt(0);
const LF = "\n".charCodeAt(0);
class LineStream extends TransformStream {
    #bufs = new BytesList();
    #prevHadCR = false;
    constructor(){
        super({
            transform: (chunk, controller)=>{
                this.#handle(chunk, controller);
            },
            flush: (controller)=>{
                controller.enqueue(this.#mergeBufs(false));
            }
        });
    }
    #handle(chunk, controller) {
        const lfIndex = chunk.indexOf(LF);
        if (this.#prevHadCR) {
            this.#prevHadCR = false;
            if (lfIndex === 0) {
                controller.enqueue(this.#mergeBufs(true));
                this.#handle(chunk.subarray(1), controller);
                return;
            }
        }
        if (lfIndex === -1) {
            if (chunk.at(-1) === CR) {
                this.#prevHadCR = true;
            }
            this.#bufs.add(chunk);
        } else {
            let crOrLfIndex = lfIndex;
            if (chunk[lfIndex - 1] === CR) {
                crOrLfIndex--;
            }
            this.#bufs.add(chunk.subarray(0, crOrLfIndex));
            controller.enqueue(this.#mergeBufs(false));
            this.#handle(chunk.subarray(lfIndex + 1), controller);
        }
    }
    #mergeBufs(prevHadCR) {
        const mergeBuf = this.#bufs.concat();
        this.#bufs = new BytesList();
        if (prevHadCR) {
            return mergeBuf.subarray(0, -1);
        } else {
            return mergeBuf;
        }
    }
}
class DelimiterStream extends TransformStream {
    #bufs = new BytesList();
    #delimiter;
    #inspectIndex = 0;
    #matchIndex = 0;
    #delimLen;
    #delimLPS;
    constructor(delimiter){
        super({
            transform: (chunk, controller)=>{
                this.#handle(chunk, controller);
            },
            flush: (controller)=>{
                controller.enqueue(this.#bufs.concat());
            }
        });
        this.#delimiter = delimiter;
        this.#delimLen = delimiter.length;
        this.#delimLPS = createLPS(delimiter);
    }
    #handle(chunk2, controller2) {
        this.#bufs.add(chunk2);
        let localIndex = 0;
        while(this.#inspectIndex < this.#bufs.size()){
            if (chunk2[localIndex] === this.#delimiter[this.#matchIndex]) {
                this.#inspectIndex++;
                localIndex++;
                this.#matchIndex++;
                if (this.#matchIndex === this.#delimLen) {
                    const matchEnd = this.#inspectIndex - this.#delimLen;
                    const readyBytes = this.#bufs.slice(0, matchEnd);
                    controller2.enqueue(readyBytes);
                    this.#bufs.shift(this.#inspectIndex);
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
class TextDelimiterStream extends TransformStream {
    #buf = "";
    #delimiter;
    #inspectIndex = 0;
    #matchIndex = 0;
    #delimLPS;
    constructor(delimiter){
        super({
            transform: (chunk, controller)=>{
                this.#handle(chunk, controller);
            },
            flush: (controller)=>{
                controller.enqueue(this.#buf);
            }
        });
        this.#delimiter = delimiter;
        this.#delimLPS = createLPS(new TextEncoder().encode(delimiter));
    }
    #handle(chunk3, controller3) {
        this.#buf += chunk3;
        let localIndex1 = 0;
        while(this.#inspectIndex < this.#buf.length){
            if (chunk3[localIndex1] === this.#delimiter[this.#matchIndex]) {
                this.#inspectIndex++;
                localIndex1++;
                this.#matchIndex++;
                if (this.#matchIndex === this.#delimiter.length) {
                    const matchEnd1 = this.#inspectIndex - this.#delimiter.length;
                    const readyString = this.#buf.slice(0, matchEnd1);
                    controller3.enqueue(readyString);
                    this.#buf = this.#buf.slice(this.#inspectIndex);
                    this.#inspectIndex = 0;
                    this.#matchIndex = 0;
                }
            } else {
                if (this.#matchIndex === 0) {
                    this.#inspectIndex++;
                    localIndex1++;
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
