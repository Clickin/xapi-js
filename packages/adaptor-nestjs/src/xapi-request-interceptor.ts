import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { parse } from "@xapi-js/core";
import { Observable } from "rxjs";

/**
 * Interceptor that parses incoming XML request bodies into XapiRoot objects.
 * This interceptor should be applied to routes that expect an `application/xml` content type
 * and whose body contains X-API XML data.
 */
@Injectable()
export class XapiRequestInterceptor implements NestInterceptor {
  private readonly logger: Logger = new Logger(XapiRequestInterceptor.name);

  /**
   * Intercepts the incoming request to parse XML body.
   * If the content type is `application/xml` and a body exists, it attempts to parse the body
   * into an `XapiRoot` object and replaces the original request body with it.
   * @param context - The execution context of the request.
   * @param next - A `CallHandler` to invoke the next interceptor or the route handler.
   * @returns An `Observable` that will eventually contain the response.
   */
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    this.logger.debug(`XapiRequestInterceptor Intercepting request: ${request.method} ${request.url}`);
    // Deserialize XML input to XapiRoot object
    if (request.headers['content-type'] === 'application/xml' && request.body) {
      request.body = await parse(request.body);
    }
    return next.handle()
  }
}