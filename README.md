# xapi-js

TypeScript adapters for Tobesoft X-API XML used by Nexacro Platform and XPlatform.

xapi-js maps each X-API Dataset to a typed array and each Root to a plain object
containing parameters and datasets. The schema keeps wire-only column metadata
such as `INT`, `FLOAT`, `DECIMAL`, and `BIGDECIMAL` explicit while TypeScript
infers the request and response object types.

## Packages

- `@xapi-js/core`: XML parser/writer, Dataset API, and typed schemas.
- `@xapi-js/adaptor-fetch`: typed X-API HTTP client.
- `@xapi-js/adaptor-express`: Express server middleware.
- `@xapi-js/adaptor-nestjs`: NestJS request/response interceptors.
- `@xapi-js/adaptor-hono`: Hono server handler.

## Typed schema

```ts
import { RequestOf, ResponseOf, xapi } from '@xapi-js/core';

const searchUsers = xapi.operation({
  request: xapi.root({
    datasets: {
      input: xapi.dataset({
        id: xapi.int(),
        minimumBalance: xapi.bigdecimal(),
      }),
    },
  }),
  response: xapi.root({
    parameters: { ErrorCode: xapi.int() },
    datasets: {
      users: xapi.dataset({
        id: xapi.int(),
        name: xapi.string({ size: 100 }),
        balance: xapi.bigdecimal(),
      }),
    },
  }),
});

type SearchRequest = RequestOf<typeof searchUsers>;
type SearchResponse = ResponseOf<typeof searchUsers>;
```

No per-Dataset conversion code is needed: adapters accept and return these
inferred plain object types directly. The original `XapiRoot` and `Dataset`
APIs remain available.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

---

xapi-js는 Nexacro Platform 및 XPlatform에서 사용하는 투비소프트 X-API XML용
TypeScript 어댑터입니다. 하나의 Dataset은 타입이 추론되는 배열로, Root는
parameters와 여러 datasets를 가진 plain object로 매핑됩니다. JavaScript에서는
모두 `number`인 값도 전송 시 필요한 `INT`, `FLOAT`, `DECIMAL`,
`BIGDECIMAL` 메타데이터를 schema에 명시할 수 있습니다.
