import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import {
  decodeRoot,
  decodeXapiWire,
  parse,
  type XapiAdapterOptions,
  type XapiRootSchema,
  xapiBodyToBytes,
  xapiContentTypeMatches,
} from "@xapi-js/core";
import { Observable } from "rxjs";

@Injectable()
export class XapiRequestInterceptor implements NestInterceptor {
  private readonly logger: Logger = new Logger(XapiRequestInterceptor.name);
  private readonly schema?: XapiRootSchema;
  private readonly options?: XapiAdapterOptions;

  constructor(schema?: XapiRootSchema, options?: XapiAdapterOptions);
  constructor(options?: XapiAdapterOptions);
  constructor(schemaOrOptions?: XapiRootSchema | XapiAdapterOptions, options?: XapiAdapterOptions) {
    if (schemaOrOptions && "kind" in schemaOrOptions) {
      this.schema = schemaOrOptions;
      this.options = options;
    } else {
      this.options = schemaOrOptions;
    }
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    this.logger.debug(`XapiRequestInterceptor Intercepting request: ${request.method} ${request.url}`);
    const codec = this.options?.codec;
    if (xapiContentTypeMatches(request.headers['content-type'], codec) && request.body) {
      const root = codec === undefined
        ? parse(request.body)
        : decodeXapiWire(xapiBodyToBytes(request.body), codec);
      request.body = this.schema ? decodeRoot(this.schema, root) : root;
    }
    return next.handle();
  }
}
