import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { XapiRoot, writeString } from '@xapi-js/core';
import { Observable, map } from 'rxjs';

@Injectable()
export class XapiResponseInterceptor implements NestInterceptor<XapiRoot, Promise<string>> {
  private readonly logger: Logger = new Logger(XapiResponseInterceptor.name);
  intercept(context: ExecutionContext, next: CallHandler): Observable<Promise<string>> {
    this.logger.debug(`XapiResponseInterceptor Intercepting response`);
    return next.handle().pipe(
      map(async (value) => {
        if (value instanceof XapiRoot) {
          try {
            // Serialize XapiRoot output to XML string
            const xmlOutput = await writeString(value as XapiRoot);
            return xmlOutput!!;
          } catch (error) {
            this.logger.error(`Failed to serialize XapiRoot to XML string: ${error.message}`);
            throw error; // Re-throw the original error
          }
        }
        else {
          throw new Error('Handler did not return an XapiRoot instance');
        }
      })
    )
  }
}
