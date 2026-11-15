# @xapi-js/adaptor-nestjs

NestJS request/response interceptor로 X-API payload를 처리합니다. schema를 지정하면 controller body와 반환값을 타입이 추론된 plain object로 사용할 수 있습니다.

기본 codec은 Nexacro XML이며, 기존 interceptor 호출은 그대로 동작합니다.

## 설치

```bash
pnpm add @xapi-js/core @xapi-js/adaptor-nestjs @nestjs/common rxjs
```

## 기본 XML 사용

```ts
import { Body, Controller, Post, UseInterceptors } from "@nestjs/common";
import { InferRoot, xapi } from "@xapi-js/core";
import {
  XapiRequestInterceptor,
  XapiResponseInterceptor,
} from "@xapi-js/adaptor-nestjs";

const requestSchema = xapi.root({
  datasets: { input: xapi.dataset({ id: xapi.int() }) },
});
const responseSchema = xapi.root({
  datasets: { output: xapi.dataset({ id: xapi.int(), name: xapi.string() }) },
});

@Controller("xapi")
export class XapiController {
  @Post()
  @UseInterceptors(
    new XapiRequestInterceptor(requestSchema),
    new XapiResponseInterceptor(responseSchema),
  )
  handle(@Body() request: InferRoot<typeof requestSchema>) {
    return {
      parameters: {},
      datasets: {
        output: request.datasets.input.map(({ id }) => ({ id, name: `user-${id}` })),
      },
    };
  }
}
```

codec을 생략하면 request interceptor는 `application/xml` body를 읽고, response interceptor는 XML 문자열을 반환합니다.

## JSON·SSV·Binary codec

request와 response interceptor에 같은 codec을 지정합니다.

```ts
@UseInterceptors(
  new XapiRequestInterceptor(requestSchema, {
    codec: {
      profile: "nexacro-json-1.0",
      options: { zlib: true },
    },
  }),
  new XapiResponseInterceptor(responseSchema, {
    codec: {
      profile: "nexacro-json-1.0",
      options: { zlib: true },
    },
  }),
)
```

Binary body를 문자열로 변환하지 않도록 Nest의 raw body 설정을 사용해야 합니다. interceptor는 문자열, `Buffer`, `Uint8Array` body를 처리하며, response codec이 Binary이면 `Uint8Array`를 반환합니다.

지원 profile:

- `nexacro-json-1.0`
- `nexacro-xml-4000`
- `xplatform-xml-4000`
- `xplatform-xml-5000`
- `nexacro-ssv`
- `xplatform-ssv`
- `nexacro-binary-5000`
- `xplatform-binary-5000`

기본 media type은 XML `application/xml`, JSON `application/json`, SSV `application/x-ssv`, Binary `application/octet-stream`입니다. 서버 계약이 다르면 codec 객체의 `contentType`을 지정하십시오.

## schema 없이 사용

```ts
new XapiRequestInterceptor({ codec: "xplatform-ssv" });
new XapiResponseInterceptor({ codec: "xplatform-ssv" });
```

schema를 생략하면 handler는 `XapiRoot`를 받고 반환해야 합니다. schema를 지정하면 plain object와 `XapiRoot` 변환을 interceptor가 수행합니다.

`options`의 `zlib`, `strict`, `limits`, Base64 정책은 `@xapi-js/core`의 `WireCodecOptions`와 동일합니다.
