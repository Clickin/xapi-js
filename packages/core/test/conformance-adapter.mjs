import { createInterface } from "node:readline";
import {
  WireCodecError,
  decodeWire,
  encodeWire,
} from "../dist/index.js";

const profiles = ["nexacro-json-1.0", "nexacro-xml-4000", "xplatform-xml-4000", "nexacro-ssv", "xplatform-ssv", "nexacro-binary-5000", "xplatform-binary-5000"];
const capabilities = {
  protocolVersion: "1.0",
  implementation: "xapi-js",
  profiles: profiles.map(name => ({
    name,
    operations: ["decode", "encode", "roundtrip"],
    options: ["strict", "base64Whitespace", "limits", "zlib", ...(name.endsWith("-ssv") ? ["ssvUnitSeparator", "ssvRecordSeparator"] : [])],
    limits: { payloadBytes: 10 << 20, datasets: 100, rows: 100000, columns: 1000, scalarBytes: 1 << 20, blobBytes: 10 << 20 },
  })),
};

function decodeBase64(input) {
  if (!input || input.encoding !== "base64") throw new WireCodecError("malformed-input", "unsupported input encoding", "input.data");
  const data = input.data;
  if (typeof data !== "string") throw new WireCodecError("malformed-input", "base64 data must be a string", "input.data");
  if (/\s/.test(data) || data.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) throw new WireCodecError("malformed-input", "invalid base64", "input.data");
  return Buffer.from(data, "base64");
}

function decodeValue(bytes, profile, options) {
  return decodeWire(bytes, profile, options);
}

function encodeValue(value, profile, options) {
  return Buffer.from(encodeWire(value, profile, options));
}

function failure(error, defaultClass) {
  if (error instanceof WireCodecError) return { ok: false, error: { class: error.class || defaultClass, ...(error.path ? { path: error.path } : {}), message: error.message } };
  return { ok: false, error: { class: defaultClass, message: error instanceof Error ? error.message : String(error) } };
}

function operation(request) {
  if (request.operation === "capabilities") return capabilities;
  if (!profiles.includes(request.profile)) return { ok: false, error: { class: "unsupported-profile", path: "profile" } };
  if (!["decode", "encode", "roundtrip"].includes(request.operation)) return { ok: false, error: { class: "unsupported-operation", path: "operation" } };
  const options = request.options || {};
  if (options.strict !== false) {
    const unknown = Object.keys(options).find(key => !["strict", "base64Whitespace", "limits", "zlib", "ssvUnitSeparator", "ssvRecordSeparator"].includes(key));
    if (unknown) return { ok: false, error: { class: "invalid-request", path: `options.${unknown}` } };
  }
  try {
    if (request.operation === "encode") {
      if (!request.value) return { ok: false, error: { class: "invalid-request", path: "value" } };
      if ("saveType" in request.value) throw new WireCodecError("malformed-input", "saveType is not supported");
      const bytes = encodeValue(request.value, request.profile, options);
      return { ok: true, value: request.value, output: { encoding: "base64", data: bytes.toString("base64") } };
    }
    if (!request.input) return { ok: false, error: { class: "invalid-request", path: "input" } };
    const bytes = decodeBase64(request.input);
    const value = decodeValue(bytes, request.profile, options);
    if (request.operation === "decode") return { ok: true, value };
    const output = encodeValue(value, request.profile, options);
    return { ok: true, value, output: { encoding: "base64", data: output.toString("base64") } };
  } catch (error) {
    return failure(error, request.operation === "encode" ? "invalid-value" : "malformed-input");
  }
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  try { process.stdout.write(`${JSON.stringify(operation(JSON.parse(line)))}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify(failure(error, "invalid-request"))}\n`); }
}
