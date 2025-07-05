# xapi-ts

This is a monorepo for xapi-ts, a TypeScript implementation of Tobesoft's X-API for communication with Nexacro Platform and XPlatform solutions. The XML structure definition refers to [https://docs.tobesoft.com/admin_guide_xplatform_ko/677db8865945f4f9#824af6a836cea237](https://docs.tobesoft.com/admin_guide_xplatform_ko/677db8865945f4f9#824af6a836cea237) and [https://docs.tobesoft.com/admin_guide_nexacro_14_ko/9f3df243cfdca430](https://docs.tobesoft.com/admin_guide_nexacro_14_ko/9f3df243cfdca430).

## Packages

- `core`: Core utilities and types for xAPI.
- `adaptor-express`: Express.js adaptor for xAPI.
- `adaptor-fetch`: Fetch API adaptor for xAPI.
- `adaptor-nestjs`: NestJS adaptor for xAPI.

## Installation

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

## Testing

```bash
pnpm test
```

---

# xapi-ts

xAPI (Experience API) 데이터를 TypeScript에서 다루기 위한 라이브러리 모음인 xapi-ts 모노레포입니다. 이 프로젝트는 투비소프트의 넥사크로 플랫폼 및 XPlatform 솔루션과의 통신을 위한 X-API의 타입스크립트 구현체입니다. XML 구조 정의는 [https://docs.tobesoft.com/admin_guide_xplatform_ko/677db8865945f4f9#824af6a836cea237](https://docs.tobesoft.com/admin_guide_xplatform_ko/677db8865945f4f9#824af6a836cea237) 및 [https://docs.tobesoft.com/admin_guide_nexacro_14_ko/9f3df243cfdca430](https://docs.tobesoft.com/admin_guide_nexacro_14_ko/9f3df243cfdca430)를 참조하였습니다.

## 패키지

- `core`: xAPI를 위한 핵심 유틸리티 및 타입.
- `adaptor-express`: Express.js xAPI 어댑터.
- `adaptor-fetch`: Fetch API xAPI 어댑터.
- `adaptor-nestjs`: NestJS xAPI 어댑터.

## 설치

```bash
pnpm install
```

## 개발

```bash
pnpm dev
```

## 테스트

```bash
pnpm test
```