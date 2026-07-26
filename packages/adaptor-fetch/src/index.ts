import {
  decodeRoot,
  decodeXapiWire,
  encodeRoot,
  encodeXapiWire,
  parse,
  RequestOf,
  ResponseOf,
  type XapiCodecSelection,
  write,
  XapiOperation,
  XapiRoot,
  xapiContentType,
} from '@xapi-js/core';

export interface XapiFetchOptions extends RequestInit {
  codec?: XapiCodecSelection;
}

export function xapiFetch(url: string, xapi: XapiRoot, options?: XapiFetchOptions): Promise<XapiRoot>;
export function xapiFetch<Operation extends XapiOperation>(
  url: string,
  operation: Operation,
  request: RequestOf<Operation>,
  options?: XapiFetchOptions,
): Promise<ResponseOf<Operation>>;
export async function xapiFetch(
  url: string,
  input: XapiRoot | XapiOperation,
  requestOrOptions?: unknown,
  operationOptions?: XapiFetchOptions,
): Promise<XapiRoot | ResponseOf<XapiOperation>> {
  const operation = input instanceof XapiRoot ? undefined : input;
  const requestRoot: XapiRoot = operation
    ? encodeRoot(operation.request, requestOrOptions as RequestOf<typeof operation>)
    : input as XapiRoot;
  const options = operation ? operationOptions : requestOrOptions as XapiFetchOptions | undefined;
  const codec = operation?.codec ?? options?.codec;
  const { codec: _codec, ...requestInit } = options || {};
  const useWireCodec = codec !== undefined;
  const body = useWireCodec ? encodeXapiWire(requestRoot, codec) : write(requestRoot);
  const response = await fetch(url, {
    method: "POST",
    ...requestInit,
    headers: {
      'Content-Type': useWireCodec ? xapiContentType(codec) : 'application/xml',
      ...options?.headers,
    },
    body: body as BodyInit,
  });

  if (!response.body) throw new Error('Response body is empty');
  const responseRoot = useWireCodec
    ? decodeXapiWire(new Uint8Array(await response.arrayBuffer()), codec)
    : parse(await response.text());
  return operation ? decodeRoot(operation.response, responseRoot) : responseRoot;
}
