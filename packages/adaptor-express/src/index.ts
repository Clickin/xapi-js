import { parse, StringWritableStream, write, XapiRoot } from '@xapi-js/core';
import { NextFunction, Request, Response } from 'express';

type XapiExpressHandler = (xapi: XapiRoot) => Promise<XapiRoot>;

export const xapiExpress = (handler: XapiExpressHandler) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    console.log('xapiExpress middleware called');
    console.log('Request headers:', req.headers);
    if (req.headers['content-type'] !== 'application/xml') {
      return next();
    }

    try {
      const xapiReq = parse(req.body as ReadableStream);
      if (!(xapiReq instanceof XapiRoot)) {
        throw new Error('Invalid XML');
      }
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