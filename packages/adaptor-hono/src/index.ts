import {
  decodeRoot,
  decodeXapiWire,
  encodeRoot,
  encodeXapiWire,
  parse,
  RequestOf,
  ResponseOf,
  type XapiAdapterOptions,
  XapiOperation,
  write,
  xapiContentType,
  xapiContentTypeMatches,
} from '@xapi-js/core';
import type { Context, Env } from 'hono';

export type XapiHonoOptions = XapiAdapterOptions;
export type XapiHonoHandler<Operation extends XapiOperation, Environment extends Env = Env> = (
  request: RequestOf<Operation>,
  context: Context<Environment>,
) => ResponseOf<Operation> | Promise<ResponseOf<Operation>>;

export function xapiHono<Operation extends XapiOperation, Environment extends Env = Env>(
  operation: Operation,
  handler: XapiHonoHandler<Operation, Environment>,
  options?: XapiHonoOptions,
) {
  return async (context: Context<Environment>): Promise<Response> => {
    const codec = operation.codec ?? options?.codec;
    if (!xapiContentTypeMatches(context.req.header('content-type'), codec)) {
      return new Response(`Content-Type must be ${codec === undefined ? 'application/xml' : xapiContentType(codec)}`, { status: 415 });
    }

    const requestRoot = codec === undefined
      ? parse(await context.req.text())
      : decodeXapiWire(new Uint8Array(await context.req.arrayBuffer()), codec);
    const request = decodeRoot(operation.request, requestRoot) as RequestOf<Operation>;
    const response = await handler(request, context);
    const responseRoot = encodeRoot(operation.response, response);
    const output = codec === undefined ? write(responseRoot) : encodeXapiWire(responseRoot, codec);
    return new Response(output as BodyInit, {
      headers: { 'Content-Type': codec === undefined ? 'application/xml' : xapiContentType(codec) },
    });
  };
}
