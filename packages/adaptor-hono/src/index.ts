import {
  decodeRoot,
  encodeRoot,
  parse,
  RequestOf,
  ResponseOf,
  write,
  XapiOperation,
} from '@xapi-js/core';
import type { Context, Env } from 'hono';

export type XapiHonoHandler<Operation extends XapiOperation, Environment extends Env = Env> = (
  request: RequestOf<Operation>,
  context: Context<Environment>,
) => ResponseOf<Operation> | Promise<ResponseOf<Operation>>;

export function xapiHono<Operation extends XapiOperation, Environment extends Env = Env>(
  operation: Operation,
  handler: XapiHonoHandler<Operation, Environment>,
) {
  return async (context: Context<Environment>): Promise<Response> => {
    if (!context.req.header('content-type')?.startsWith('application/xml')) {
      return new Response('Content-Type must be application/xml', { status: 415 });
    }

    const request = decodeRoot(operation.request, parse(await context.req.text())) as RequestOf<Operation>;
    const response = await handler(request, context);
    return new Response(write(encodeRoot(operation.response, response)), {
      headers: { 'Content-Type': 'application/xml' },
    });
  };
}
