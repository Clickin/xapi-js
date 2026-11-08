# @xapi-js/core

Nexacro Platform과 XPlatform X-API의 schema, Dataset, XML 및 wire codec 핵심 API입니다.

## 설치

```bash
pnpm add @xapi-js/core
```

## operation과 타입 스키마

```ts
import { RequestOf, ResponseOf, xapi } from "@xapi-js/core";

const search = xapi.operation({
  request: xapi.root({
    parameters: { service: xapi.string() },
    datasets: {
      input: xapi.dataset({ id: xapi.int(), keyword: xapi.string() }),
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

type SearchRequest = RequestOf<typeof search>;
type SearchResponse = ResponseOf<typeof search>;
```

`xapi.operation`은 요청과 응답 schema뿐 아니라 선택적 `codec`도 가집니다. codec을 생략하면 기존 Nexacro XML 동작입니다.

```ts
const binarySearch = xapi.operation({
  codec: {
    profile: "nexacro-binary-5000",
    options: { zlib: true },
  },
  request: requestSchema,
  response: responseSchema,
});
```

## Root bridge

schema API는 plain object와 `XapiRoot`를 변환하고, wire bridge는 `XapiRoot`와 bytes를 연결합니다.

```ts
import {
  decodeRoot,
  decodeXapiWire,
  encodeRoot,
  encodeXapiWire,
} from "@xapi-js/core";

const root = encodeRoot(search.request, request);
const body = encodeXapiWire(root, "nexacro-json-1.0");
const decodedRoot = decodeXapiWire(body, "nexacro-json-1.0");
const decoded = decodeRoot(search.request, decodedRoot);
```

`encodeXapiWire`와 `decodeXapiWire`는 `XapiRoot`의 컬럼 타입, raw lexical 값, row status, original row, const column을 wire codec에 맞게 변환합니다.

## Wire codec

```ts
import { decodeWire, encodeWire, roundtripWire } from "@xapi-js/core";

const bytes = encodeWire(canonicalValue, "nexacro-ssv", { zlib: true });
const value = decodeWire(bytes, "nexacro-ssv");
const result = roundtripWire(bytes, "nexacro-ssv");
```

지원 profile:

- `nexacro-json-1.0`
- `nexacro-xml-4000`
- `xplatform-xml-4000`
- `xplatform-xml-5000`
- `nexacro-ssv`
- `xplatform-ssv`
- `nexacro-binary-5000`
- `xplatform-binary-5000`

`WireCodecOptions`에는 `strict`, `zlib`, `base64Whitespace`, SSV 정책, payload·row·column·BLOB limits가 있습니다. zlib encode 결과에는 `0xFF 0xAD` transport marker가 붙고, decode 시 marker가 있으면 자동으로 inflate합니다.

## 저수준 Dataset API

```ts
import { Dataset, XapiRoot, parse, write } from "@xapi-js/core";

const root = new XapiRoot();
const users = new Dataset("users");
users.addColumn({ id: "id", type: "INT", size: 10 });
users.addColumn({ id: "name", type: "STRING", size: 100 });
const row = users.newRow();
users.setColumn(row, "id", 1);
users.setColumn(row, "name", "Alice");
root.addDataset(users);

const xml = write(root);
const parsed = parse(xml);
```
