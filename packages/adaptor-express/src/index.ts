import {
  decodeRoot,
  decodeXapiWire,
  encodeRoot,
  encodeXapiWire,
  parse,
  RequestOf,
  ResponseOf,
  type XapiAdapterOptions,
  write,
  XapiOperation,
  XapiRoot,
  xapiBodyToBytes,
  xapiContentType,
  xapiContentTypeMatches,
} from '@xapi-js/core';
import { NextFunction, Request, Response } from 'express';

type XapiExpressHandler = (xapi: XapiRoot) => Promise<XapiRoot>;
type XapiOperationHandler<Operation extends XapiOperation> = (
  request: RequestOf<Operation>,
) => ResponseOf<Operation> | Promise<ResponseOf<Operation>>;
export type XapiExpressOptions = XapiAdapterOptions;
export type XapiExpressMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

export function xapiExpress(handler: XapiExpressHandler, options?: XapiExpressOptions): XapiExpressMiddleware;
export function xapiExpress<Operation extends XapiOperation>(
  operation: Operation,
  handler: XapiOperationHandler<Operation>,
  options?: XapiExpressOptions,
): XapiExpressMiddleware;
export function xapiExpress(
  operationOrHandler: XapiOperation | XapiExpressHandler,
  operationHandlerOrOptions?: XapiOperationHandler<XapiOperation> | XapiExpressOptions,
  adapterOptions?: XapiExpressOptions,
): XapiExpressMiddleware {
  const operation = typeof operationOrHandler === 'function' ? undefined : operationOrHandler;
  const handler = typeof operationOrHandler === 'function' ? operationOrHandler : operationHandlerOrOptions as XapiOperationHandler<XapiOperation>;
  const options = typeof operationOrHandler === 'function' ? operationHandlerOrOptions as XapiExpressOptions | undefined : adapterOptions;
  return createMiddleware(async (req, res, next) => {
    const codec = operation?.codec ?? options?.codec;
    const contentType = codec === undefined ? 'application/xml' : xapiContentType(codec);
    if (!xapiContentTypeMatches(req.headers['content-type'], codec)) return next();

    try {
      const requestRoot = codec === undefined
        ? parse(req.body)
        : decodeXapiWire(xapiBodyToBytes(req.body), codec);
      const request = operation ? decodeRoot(operation.request, requestRoot) : requestRoot;
      const response = await handler(request as never);
      const responseRoot = operation
        ? encodeRoot(operation.response, response as ResponseOf<typeof operation>)
        : response as XapiRoot;
      const output = codec === undefined ? write(responseRoot) : encodeXapiWire(responseRoot, codec);
      res.setHeader('Content-Type', contentType);
      res.write(output);
      res.end();
    } catch (error) {
      next(error);
    }
  });
}

function createMiddleware(
  middleware: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): XapiExpressMiddleware {
  return async (req: Request, res: Response, next: NextFunction) => middleware(req, res, next);
}
