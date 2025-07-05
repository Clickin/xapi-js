import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map, mergeMap } from 'rxjs';
import { parse, write, XapiRoot } from '@xapi-js/core';

@Injectable()
export class XapiRootInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Deserialize XML input to XapiRoot object
    if (request.headers['content-type'] === 'application/xml' && request.body) {
      request.body = parse(request.body);
    }

    return next.handle().pipe(
      mergeMap(async data => {
        // Serialize XapiRoot output to XML string
        if (data instanceof XapiRoot) {
          response.setHeader('Content-Type', 'application/xml');
          let xmlString = '';
          const writableStream = new WritableStream({
            write(chunk) {
              xmlString += chunk;
            },
          });
          await write(writableStream, data);
          return xmlString;
        }
        return data;
      }),
    );
  }
}