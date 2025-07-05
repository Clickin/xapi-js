# @xapi-ts/adaptor-fetch

This package provides a Fetch API adaptor for X-API data.

## Installation

```bash
# npm
npm install @xapi-ts/adaptor-fetch

# yarn
yarn add @xapi-ts/adaptor-fetch

# pnpm
pnpm add @xapi-ts/adaptor-fetch

# bun
bun add @xapi-ts/adaptor-fetch

# deno
deno add @xapi-ts/adaptor-fetch
```

## Usage

Here's how to use `@xapi-ts/adaptor-fetch` to send and receive X-API data:

```typescript
import { xapiFetch } from '@xapi-ts/adaptor-fetch';
import { XapiRoot } from '@xapi-ts/core';

async function sendXapiRequest() {
  const requestXapi = new XapiRoot();
  requestXapi.addParameter({ id: 'service', value: 'stock' });
  requestXapi.addParameter({ id: 'method', value: 'search' });

  try {
    const responseXapi = await xapiFetch('http://localhost:3000/api/xapi', requestXapi);

    // Access parameters from the response
    const result = responseXapi.parameters.get('result')?.value;
    console.log(`Result: ${result}`);

    // Access datasets from the response
    const stockDataset = responseXapi.getDataset('stockList');
    if (stockDataset) {
      console.log('Stock List:');
      stockDataset.rows.forEach(row => {
        console.log(`  Code: ${row.get('stockCode')}, Price: ${row.get('currentPrice')}`);
      });
    }
  } catch (error) {
    console.error('Error sending X-API request:', error);
  }
}

sendXapiRequest();
```

---

# @xapi-ts/adaptor-fetch

이 패키지는 X-API 데이터를 위한 Fetch API 어댑터를 제공합니다.

## 설치

```bash
# npm
npm install @xapi-ts/adaptor-fetch

# yarn
yarn add @xapi-ts/adaptor-fetch

# pnpm
pnpm add @xapi-ts/adaptor-fetch

# bun
bun add @xapi-ts/adaptor-fetch

# deno
deno add @xapi-ts/adaptor-fetch
```

## 사용법

다음은 `@xapi-ts/adaptor-fetch`를 사용하여 X-API 데이터를 송수신하는 방법입니다:

```typescript
import { xapiFetch } from '@xapi-ts/adaptor-fetch';
import { XapiRoot } from '@xapi-ts/core';

async function sendXapiRequest() {
  const requestXapi = new XapiRoot();
  requestXapi.addParameter({ id: 'service', value: 'stock' });
  requestXapi.addParameter({ id: 'method', value: 'search' });

  try {
    const responseXapi = await xapiFetch('http://localhost:3000/api/xapi', requestXapi);

    // 응답에서 파라미터 접근
    const result = responseXapi.parameters.get('result')?.value;
    console.log(`결과: ${result}`);

    // 응답에서 데이터셋 접근
    const stockDataset = responseXapi.getDataset('stockList');
    if (stockDataset) {
      console.log('주식 목록:');
      stockDataset.rows.forEach(row => {
        console.log(`  코드: ${row.get('stockCode')}, 가격: ${row.get('currentPrice')}`);
      });
    }
  } catch (error) {
    console.error('X-API 요청 전송 오류:', error);
  }
}

sendXapiRequest();
```