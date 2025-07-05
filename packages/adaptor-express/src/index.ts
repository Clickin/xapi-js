import { parse, StringWritableStream, write, XapiRoot } from '@xapi-js/core';
import { NextFunction, Request, Response } from 'express';

type XapiExpressHandler = (xapi: XapiRoot) => Promise<XapiRoot>;

export const xapiExpress = (handler: XapiExpressHandler) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.headers['content-type'] !== 'application/xml') {
      return next();
    }

    try {
      // req.body는 이미 문자열이라고 가정
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