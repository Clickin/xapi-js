# @xapi-js/core

Core XML, Dataset, and typed-schema support for Tobesoft X-API.

## Installation

```bash
pnpm add @xapi-js/core
```

## Typed schemas

A Dataset schema maps to `T[]`; a Root schema maps to an object containing
`parameters` and named `datasets`. Column methods preserve X-API wire types,
even when multiple wire types map to JavaScript `number`.

```ts
import { InferRoot, RequestOf, ResponseOf, xapi } from '@xapi-js/core';

const request = xapi.root({
  parameters: {
    service: xapi.string(),
  },
  datasets: {
    input: xapi.dataset({
      id: xapi.int(),
      amount: xapi.bigdecimal(),
      ratio: xapi.decimal(),
      score: xapi.float(),
      note: xapi.string({ optional: true }),
    }),
  },
});

type RequestPayload = InferRoot<typeof request>;

const operation = xapi.operation({
  request,
  response: xapi.root({
    parameters: { ErrorCode: xapi.int(), ErrorMsg: xapi.string() },
    datasets: {
      output: xapi.dataset({
        id: xapi.int(),
        amount: xapi.bigdecimal(),
      }),
    },
  }),
});

type OperationRequest = RequestOf<typeof operation>;
type OperationResponse = ResponseOf<typeof operation>;
```

`encodeRoot(schema, value)` converts the inferred plain object to `XapiRoot`.
`decodeRoot(schema, root)` converts it back. Adapters call these functions
automatically when supplied with a schema or operation.

## Low-level API

The original Dataset API remains available when dynamic column access is needed.

```ts
import { Dataset, parse, write, XapiRoot } from '@xapi-js/core';

const root = new XapiRoot();
const users = new Dataset('users');
users.addColumn({ id: 'id', type: 'INT', size: 10 });
users.addColumn({ id: 'name', type: 'STRING', size: 100 });

const row = users.newRow();
users.setColumn(row, 'id', 1);
users.setColumn(row, 'name', 'Alice');
root.addDataset(users);

const xml = write(root);
const parsed = parse(xml);
```

---

Dataset schema는 `T[]`로, Root schema는 `parameters`와 여러 `datasets`를
가진 plain object로 추론됩니다. `INT`, `FLOAT`, `DECIMAL`,
`BIGDECIMAL`처럼 JavaScript 타입은 같지만 X-API 전송 타입이 다른 컬럼도
schema에서 명시적으로 구분됩니다.
