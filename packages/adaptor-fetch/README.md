# @xapi-js/adaptor-fetch

Fetch API 기반 X-API 클라이언트입니다. operation schema를 전달하면 요청·응답을 타입이 추론된 plain object로 변환합니다.

기본 codec은 기존과 동일한 Nexacro XML입니다. operation의 `codec` 또는 호출 옵션의 `codec`을 지정하면 JSON, SSV, Binary, zlib transport를 사용할 수 있습니다.

## 설치

```bash
pnpm add @xapi-js/core @xapi-js/adaptor-fetch
```

## 기본 XML 사용

```ts
import { xapi } from "@xapi-js/core";
import { xapiFetch } from "@xapi-js/adaptor-fetch";

const search = xapi.operation({
  request: xapi.root({
    datasets: {
      input: xapi.dataset({ id: xapi.int(), keyword: xapi.string() }),
    },
  }),
  response: xapi.root({
    datasets: {
      users: xapi.dataset({ id: xapi.int(), name: xapi.string() }),
    },
  }),
});

const response = await xapiFetch("/api/users", search, {
  parameters: {},
  datasets: { input: [{ id: 10, keyword: "kim" }] },
});

response.datasets.users[0].name; // string
```

codec을 생략하면 `application/xml` body와 기존 XML parser/writer를 사용합니다. 따라서 기존 호출 코드는 수정할 필요가 없습니다.

## operation에서 codec 선택

```ts
const search = xapi.operation({
  codec: {
    profile: "nexacro-ssv",
    options: { zlib: true },
  },
  request: xapi.root({
    datasets: { input: xapi.dataset({ id: xapi.int() }) },
  }),
  response: xapi.root({
    datasets: { users: xapi.dataset({ id: xapi.int(), name: xapi.string() }) },
  }),
});

const response = await xapiFetch("/api/users", search, {
  parameters: {},
  datasets: { input: [{ id: 10 }] },
});
```

`codec`은 문자열 profile로도 지정할 수 있습니다.

```ts
const search = xapi.operation({
  codec: "nexacro-json-1.0",
  request: requestSchema,
  response: responseSchema,
});
```

지원 profile은 `@xapi-js/core`의 `WireProfile`과 같습니다.

- `nexacro-json-1.0`
- `nexacro-xml-4000`
- `xplatform-xml-4000`
- `xplatform-xml-5000`
- `nexacro-ssv`
- `xplatform-ssv`
- `nexacro-binary-5000`
- `xplatform-binary-5000`

JSON은 `application/json`, SSV는 `application/x-ssv`, Binary는 `application/octet-stream`으로 전송됩니다. 서버가 다른 media type을 요구하면 codec 객체의 `contentType`으로 덮어쓸 수 있습니다.

```ts
const operation = xapi.operation({
  codec: {
    profile: "xplatform-ssv",
    contentType: "text/plain",
  },
  request: requestSchema,
  response: responseSchema,
});
```

## 호출 시 codec 지정

같은 operation을 서버별로 다른 wire protocol에 연결할 때는 `XapiFetchOptions`의 `codec`을 사용합니다.

```ts
import type { XapiFetchOptions } from "@xapi-js/adaptor-fetch";

const options: XapiFetchOptions = {
  codec: { profile: "xplatform-binary-5000", options: { zlib: true } },
  headers: { Authorization: "Bearer token" },
};

const response = await xapiFetch("/api/users", operationWithoutCodec, request, options);
```

operation에 codec이 있으면 operation 설정이 어댑터 옵션보다 우선합니다.

## Raw `XapiRoot` 사용

기존 동적 API도 유지됩니다.

```ts
import { XapiRoot } from "@xapi-js/core";

const root = new XapiRoot();
const response = await xapiFetch("/api/xapi", root);

// 명시적으로 Binary codec 선택
const binaryResponse = await xapiFetch("/api/xapi", root, {
  codec: "nexacro-binary-5000",
});
```

Binary·zlib를 사용할 때 Fetch body는 `Uint8Array`로 전송되고, 응답도 bytes로 읽어 자동 디코딩합니다.
