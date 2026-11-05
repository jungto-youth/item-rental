# 12 — 디자인 검증

디자인 검증 명령, 접근성 기준, 남은 작업, 시안 기준, 참고 링크.

## 검증

```bash
npm run check              # tsc(web·server·tests·scripts) + 시안 마커 최신 확인
npm test                   # 단위·통합 (DB 불필요)
npm run test:web           # 390/1280 브라우저 스모크 (스크린샷은 current/)
npm run build && npm run check:production
```

- `test:web` 스크린샷은 `web/tests/visual/current/`에 남고 커밋하지 않는다.
- 기준선은 **같은 브라우저/OS에서만** 일치한다. 다른 환경에서 갱신하면 전부 어긋난다.
- 접근성 기준은 WCAG 2.2 AA. axe 자동 검사는 아직 도입하지 않았다.

### 남은 것

- [ ] 시각 회귀를 CI에 넣기 (CI는 `check`·`test`·`build`만 돈다)
- [ ] 1024px 경계 기준선 (레이아웃이 갈라지는 지점인데 390/768/1280만 캡처)
- [ ] axe critical 0
- [ ] 5명 사용성 테스트
- [ ] 상세 사진 없음 화면의 밀도, 관리자 회원 행의 모바일 액션 정렬

## 시안

정적 HTML 시안은 더 이상 유지하지 않는다. 디자인 판단이 필요하면 `web/`의 실제 화면과
이 문서의 토큰·계약을 기준으로 한다.

## 참고

- [NN/g — Design Systems 101](https://www.nngroup.com/articles/design-systems-101/)
- [NN/g — Aesthetic and Minimalist Design](https://www.nngroup.com/articles/aesthetic-minimalist-design/)
- [Martin Fowler — Design Token-Based UI Architecture](https://martinfowler.com/articles/design-token-based-ui-architecture.html)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- 참고 시스템: Web Awesome(Lit), Nord, GOV.UK, Open Props
