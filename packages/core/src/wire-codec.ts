import { deflate, inflate } from "pako";
import { decodeBinaryWire, encodeBinaryWire } from "./binary-wire";
import { decodeJsonWire, encodeJsonWire } from "./json-wire";
import { decodeSsvWire, encodeSsvWire } from "./ssv-wire";
import type { CanonicalValue, WireCodecOptions, WireProfile } from "./wire-types";
import { WireCodecError } from "./wire-types";
import { decodeXmlWire, encodeXmlWire } from "./xml-wire";

function unpackTransport(source: Uint8Array): Uint8Array {
  if (source[0] !== 0xff || source[1] !== 0xad) return source;
  try {
    return inflate(source.subarray(2));
  } catch (error) {
    throw new WireCodecError("malformed-input", error instanceof Error ? error.message : String(error), "wire");
  }
}

/** Drops the original rows when the caller opts out of row state. */
function withoutRowState(value: CanonicalValue, options: WireCodecOptions): CanonicalValue {
  if (options.preserveRowState !== false) return value;
  for (let datasetIndex = 0; datasetIndex < value.datasets.length; datasetIndex++) {
    const rows = value.datasets[datasetIndex].rows;
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) rows[rowIndex].orgRow = null;
  }
  return value;
}

export function decodeWire(source: Uint8Array, profile: WireProfile, options: WireCodecOptions = {}): CanonicalValue {
  return withoutRowState(decodeProfile(unpackTransport(source), profile, options), options);
}

function decodeProfile(bytes: Uint8Array, profile: WireProfile, options: WireCodecOptions): CanonicalValue {
  if (profile === "nexacro-binary-5000" || profile === "xplatform-binary-5000") return decodeBinaryWire(bytes, profile);
  if (profile === "nexacro-ssv" || profile === "xplatform-ssv") return decodeSsvWire(bytes, profile, options);
  const text = new TextDecoder().decode(bytes);
  if (profile === "nexacro-json-1.0") return decodeJsonWire(text, options);
  return decodeXmlWire(text, profile, options);
}

/**
 * Encodes like the drivers. Without a saveType the drivers write NORMAL
 * (plain rows only); preserveRowState asks for ALL instead, so row types,
 * original rows and deleted rows are written.
 */
export function encodeWire(source: CanonicalValue, profile: WireProfile, options: WireCodecOptions = {}): Uint8Array {
  const value = options.preserveRowState && source.saveType === undefined ? { ...source, saveType: 1 as const } : source;
  let bytes: Uint8Array;
  if (profile === "nexacro-binary-5000" || profile === "xplatform-binary-5000") bytes = encodeBinaryWire(value, profile);
  else if (profile === "nexacro-ssv" || profile === "xplatform-ssv") bytes = encodeSsvWire(value, profile);
  else {
    const text = profile === "nexacro-json-1.0" ? encodeJsonWire(value, options) : encodeXmlWire(value, profile);
    bytes = new TextEncoder().encode(text);
  }
  if (!options.zlib) return bytes;
  const compressed = deflate(bytes);
  const output = new Uint8Array(compressed.length + 2);
  output[0] = 0xff;
  output[1] = 0xad;
  output.set(compressed, 2);
  return output;
}

export function roundtripWire(source: Uint8Array, profile: WireProfile, options: WireCodecOptions = {}): { value: CanonicalValue; output: Uint8Array } {
  const value = decodeWire(source, profile, options);
  return { value, output: encodeWire(value, profile, options) };
}
