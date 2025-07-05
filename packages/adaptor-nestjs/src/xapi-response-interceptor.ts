import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { XapiRoot, writeString } from '@xapi-js/core';
import { Observable, map } from 'rxjs';

/**
 * Interceptor that serializes XapiRoot objects returned by NestJS route handlers into XML strings.
 * This interceptor should be applied to routes that return an `XapiRoot` instance
 * and whose response should be `application/xml`.
 */
@Injectable()
export class XapiResponseInterceptor implements NestInterceptor<XapiRoot, Promise<string>> {
  private readonly logger: Logger = new Logger(XapiResponseInterceptor.name);

  /**
   * Intercepts the outgoing response to serialize XapiRoot to XML string.
   * If the handler returns an `XapiRoot` instance, it attempts to serialize it
   * into an XML string.
   * @param context - The execution context of the request.
   * @param next - A `CallHandler` to invoke the next interceptor or the route handler.
   * @returns An `Observable` that will eventually contain the XML string response.
   * @throws {Error} if the handler does not return an `XapiRoot` instance or serialization fails.
   */
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