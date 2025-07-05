import { parse, StringWritableStream, write, XapiRoot } from '@xapi-js/core';
import { NextFunction, Request, Response } from 'express';

/**
 * Type definition for an X-API Express handler function.
 * This function receives an XapiRoot object (parsed from the request body) and should return a Promise resolving to an XapiRoot object (for the response).
 */
type XapiExpressHandler = (xapi: XapiRoot) => Promise<XapiRoot>;

/**
 * Express middleware to handle X-API XML requests and responses.
 * It parses incoming XML into an XapiRoot object, passes it to the provided handler function,
 * and then serializes the handler's XapiRoot response back into XML.
 *
 * @param handler - An asynchronous function that takes an XapiRoot object and returns a Promise of an XapiRoot object.
 * @returns An Express middleware function.
 */
export const xapiExpress = (handler: XapiExpressHandler) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.headers['content-type'] !== 'application/xml') {
      return next();
    }

    try {
      const xapiReq = await parse(req.body);
      const xapiRes = await handler(xapiReq);
      const stringWritable = new StringWritableStream();
      await write(stringWritable, xapiRes);
      res.setHeader('Content-Type', 'application/xml');
      res.write(stringWritable.toString());
      res.end();
    } catch (error) {
      next(error);
    }
  };
};