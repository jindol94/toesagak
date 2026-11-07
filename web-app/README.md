# 퇴사각 Web

React + Vite + Supabase 기반의 모바일 우선 웹 앱입니다. 기존 Capacitor/iOS 프로젝트 파일과 분리해 `web-app/` 아래에 둡니다.

## 1. 실행

```bash
cd web-app
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`에 Supabase 프로젝트의 URL과 Publishable Key를 설정합니다.

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Secret/service_role 키는 브라우저 환경변수에 넣지 않습니다.

## 2. Supabase

SQL Editor에서 아래 순서로 실행합니다.

1. `supabase/migrations/202611070001_initial_schema.sql`
2. `supabase/migrations/202611070002_office_matchmaking_and_security.sql`

Authentication > URL Configuration에서 로컬 및 배포 URL을 Site URL / Redirect URLs에 추가하고 Email OTP를 활성화합니다.

## 3. 구현 범위

- 이메일 매직링크 로그인
- 계정별 급여/근무 설정 저장
- 초 단위 예상 수당 표시
- 6인 오피스 생성/초대 코드 입장/랜덤 매칭
- 근무 상태, 상태 메시지, 채팅 실시간 동기화
- 개인 시급 및 수입은 오피스 멤버에게 노출하지 않음

## 4. 배포

Vercel 또는 Netlify에서 Root Directory를 `web-app`으로 설정하고 Build Command `npm run build`, Output Directory `dist`로 배포합니다. 환경변수는 배포 서비스의 환경변수 설정에 등록합니다.
