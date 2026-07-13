import {
  decodeRoot,
  encodeRoot,
  parse,
  RequestOf,
  ResponseOf,
  write,
  XapiOperation,
  XapiRoot,
} from '@xapi-js/core';
import { NextFunction, Request, Response } from 'express';

/**
 * Type definition for an X-API Express handler function.
 * This function receives an XapiRoot object (parsed from the request body) and should return a Promise resolving to an XapiRoot object (for the response).
 */
type XapiExpressHandler = (xapi: XapiRoot) => Promise<XapiRoot>;
type XapiOperationHandler<Operation extends XapiOperation> = (
  request: RequestOf<Operation>,
) => ResponseOf<Operation> | Promise<ResponseOf<Operation>>;

/**
 * Express middleware to handle X-API XML requests and responses.
 * It parses incoming XML into an XapiRoot object, passes it to the provided handler function,
 * and then serializes the handler's XapiRoot response back into XML.
 *
 * @param handler - An asynchronous function that takes an XapiRoot object and returns a Promise of an XapiRoot object.
 * @returns An Express middleware function.
 */
export function xapiExpress(handler: XapiExpressHandler): ReturnType<typeof createMiddleware>;
export function xapiExpress<Operation extends XapiOperation>(
  operation: Operation,
  handler: XapiOperationHandler<Operation>,
): ReturnType<typeof createMiddleware>;
export function xapiExpress(
  operationOrHandler: XapiOperation | XapiExpressHandler,
  operationHandler?: XapiOperationHandler<XapiOperation>,
) {
  const operation = typeof operationOrHandler === 'function' ? undefined : operationOrHandler;
  const handler = typeof operationOrHandler === 'function' ? operationOrHandler : operationHandler!!;
  return createMiddleware(async (req, res, next) => {
    if (!req.headers['content-type']?.startsWith('application/xml')) {
      return next();
    }

    try {
      const requestRoot = parse(req.body);
      const request = operation ? decodeRoot(operation.request, requestRoot) : requestRoot;
      const response = await handler(request as never);
      const responseRoot = operation
        ? encodeRoot(operation.response, response as ResponseOf<typeof operation>)
        : response as XapiRoot;
      const xml = write(responseRoot);
      res.setHeader('Content-Type', 'application/xml');
      res.write(xml);
      res.end();
    } catch (error) {
      next(error);
    }
  });
}

function createMiddleware(
  middleware: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    return middleware(req, res, next);
  };
}
