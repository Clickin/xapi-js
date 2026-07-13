# @xapi-js/adaptor-nestjs

NestJS interceptors for raw or schema-typed X-API requests and responses.

## Installation

```bash
pnpm add @xapi-js/core @xapi-js/adaptor-nestjs @nestjs/common rxjs
```

## Typed usage

```ts
import { Body, Controller, Post, UseInterceptors } from '@nestjs/common';
import { InferRoot, xapi } from '@xapi-js/core';
import {
  XapiRequestInterceptor,
  XapiResponseInterceptor,
} from '@xapi-js/adaptor-nestjs';

const requestSchema = xapi.root({
  datasets: {
    input: xapi.dataset({ id: xapi.int() }),
  },
});

const responseSchema = xapi.root({
  datasets: {
    users: xapi.dataset({ id: xapi.int(), name: xapi.string() }),
  },
});

@Controller('xapi')
export class XapiController {
  @Post()
  @UseInterceptors(
    new XapiRequestInterceptor(requestSchema),
    new XapiResponseInterceptor(responseSchema),
  )
  handle(
    @Body() request: InferRoot<typeof requestSchema>,
  ): InferRoot<typeof responseSchema> {
    return {
      parameters: {},
      datasets: {
        users: request.datasets.input.map(({ id }) => ({ id, name: `user-${id}` })),
      },
    };
  }
}
```

Without a schema, both interceptors retain their original `XapiRoot` behavior.

---

schema를 interceptor에 전달하면 컨트롤러 body와 반환값을 Dataset 기반
`XapiRoot` 대신 타입이 추론된 plain object로 사용할 수 있습니다.
