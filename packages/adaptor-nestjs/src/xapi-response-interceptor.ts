import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import {
  encodeRoot,
  encodeXapiWire,
  isXapiRoot,
  type XapiAdapterOptions,
  type XapiRootSchema,
  write,
  xapiContentType,
} from '@xapi-js/core';
import { Observable, map } from 'rxjs';

@Injectable()
export class XapiResponseInterceptor implements NestInterceptor<unknown, string | Uint8Array> {
  private readonly logger: Logger = new Logger(XapiResponseInterceptor.name);
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

  intercept(context: ExecutionContext, next: CallHandler): Observable<string | Uint8Array> {
    this.logger.debug(`XapiResponseInterceptor Intercepting response`);
    const codec = this.options?.codec;
    const http = typeof context.switchToHttp === "function" ? context.switchToHttp() : undefined;
    const response = http && typeof http.getResponse === "function" ? http.getResponse() : undefined;
    if (codec !== undefined && typeof response?.setHeader === "function") response.setHeader('Content-Type', xapiContentType(codec));
    return next.handle().pipe(
      map((value) => {
        const root = this.schema ? encodeRoot(this.schema, value as never) : value;
        if (!isXapiRoot(root)) throw new Error('Handler did not return an XapiRoot instance');
        try {
          return codec === undefined ? write(root) : encodeXapiWire(root, codec);
        } catch (error) {
          this.logger.error(`Failed to serialize XapiRoot with codec: ${error}`);
          throw error;
        }
      }),
    );
  }
}
