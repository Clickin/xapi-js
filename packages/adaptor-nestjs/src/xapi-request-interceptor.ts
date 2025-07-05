import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { parse } from "@xapi-js/core";
import { Observable } from "rxjs";

@Injectable()
export class XapiRequestInterceptor implements NestInterceptor {
  private readonly logger: Logger = new Logger(XapiRequestInterceptor.name);
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