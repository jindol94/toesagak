# 회사에서 살아남기

오늘도 퇴사각 재는 직장인을 위한 필수 계산기 앱 (PWA)

- 지금 사표 내면 손에 쥐는 돈 + 생존 가능 기간 시뮬레이션
- 실수령액 · 퇴직금(DB/DC) · 연차(입사일/회계연도) · 실업급여 · 야근수당 · 이직 손익 · 명세서 검증 계산기
- 월급루팡 실시간 수입 카운터, 회의 비용 계산, 점심 룰렛
- 연휴 제조기(샌드위치 연휴 파인더), 노동법 상식, 디데이
- 기기 내 다중 프로필(PIN 잠금), 데이터 백업/복구, 다크모드

2026년 요율 기준. 모든 계산은 참고용이며 법적 효력이 없습니다.

## 개발

웹앱은 `docs/`에 있습니다 (GitHub Pages가 이 폴더를 서빙). 로컬 실행:

```bash
cd docs && python3 -m http.server 5623
```

iOS 앱 (Capacitor):

```bash
npm install
npx cap sync ios
npx cap open ios   # Xcode에서 서명 후 실행/배포
```

계산 로직 테스트:

```bash
node test.js
```

## 데이터 갱신 (연 1회)

- 요율: `calc.js` 상단 `RATES_BY_YEAR`에 새 연도 추가
- 공휴일: `index.html` 상단 `HOLIDAYS`에 새 연도 추가
