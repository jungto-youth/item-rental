# 14 — 테스트

단위·통합·브라우저 3계층 테스트와 로컬 실행 명령.

## 테스트

테스트는 세 층이다.

| 층 | 무엇을 검증하나 | 명령 |
| --- | --- | --- |
| 단위 | "어떤 SQL을 날리는가" — 가짜 DB 스텁 | `npm test` |
| 통합 | "그 SQL이 실제로 무슨 행동을 하는가" — 메모리 SQLite에 `migrations-d1/` 적용 | `npm test` |
| 브라우저 | 실제 코덱·multipart·렌더링 | 아래 개별 명령 |

```bash
npm test              # 단위 + 통합 (DB 불필요)
npm run test:web      # 배포 앱(SolidJS) 390/1280 스모크 (fixture API)
npm run test:photos   # 사진 파이프라인 (chromium 필요)
```

브라우저 테스트는 CI가 아니라 로컬에서 돌린다.

```bash
npx playwright install chromium
```

- `test:web` 스크린샷은 `web/tests/visual/current/`에 남고 커밋하지 않는다.
