# @xapi-js/adaptor-fetch

Fetch API client for raw or schema-typed X-API requests.

## Installation

```bash
pnpm add @xapi-js/core @xapi-js/adaptor-fetch
```

## Typed usage

```ts
import { xapi } from '@xapi-js/core';
import { xapiFetch } from '@xapi-js/adaptor-fetch';

const search = xapi.operation({
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
        name: xapi.string(),
        balance: xapi.bigdecimal(),
      }),
    },
  }),
});

const response = await xapiFetch('/api/users', search, {
  parameters: {},
  datasets: {
    input: [{ id: 1, minimumBalance: 100.5 }],
  },
});

response.datasets.users[0].name; // string
```

The operation controls both XML column metadata and the inferred request and
response types. For dynamic payloads, the existing
`xapiFetch(url, xapiRoot, options)` overload remains available.

---

operation schema를 전달하면 요청과 응답이 plain object로 자동 변환되며,
Dataset별 변환기나 `XapiRoot` 타입 단언이 필요하지 않습니다.
