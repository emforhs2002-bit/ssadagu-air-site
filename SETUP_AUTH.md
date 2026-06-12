# 로그인(구글·카카오) 켜는 법 — Supabase 설정 가이드

코드는 이미 다 들어가 있어요. 아래 절차로 키만 발급해서 붙여넣으면 마이 탭에
**카카오로 시작하기 / 구글로 시작하기** 버튼이 나타나고, 찜·알림조건·여행플랜이
계정에 저장돼 기기 간 동기화돼요. (키를 넣기 전까지는 로그인 UI가 숨겨지고 기존처럼 동작)

소요시간: 약 15분 · 비용: 전부 무료 티어

---

## 1. Supabase 프로젝트 만들기 (3분)

1. https://supabase.com → 가입(깃허브 계정으로 가능) → **New project**
2. 이름 아무거나(예: `ssadagu`), 리전 **Northeast Asia (Seoul)**, DB 비밀번호 저장해두기
3. 만들어지면 **Project Settings → API** 에서 두 값 복사:
   - `Project URL` (예: `https://abcd1234.supabase.co`)
   - `anon public` 키

## 2. 데이터 테이블 만들기 (1분)

좌측 **SQL Editor** → New query → 아래 전체 붙여넣고 **Run**:

```sql
create table public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  saved jsonb default '[]',
  route_watch jsonb default '[]',
  alert_prefs jsonb,
  plans jsonb default '[]',
  updated_at timestamptz default now()
);

alter table public.user_data enable row level security;

create policy "own row" on public.user_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## 3. 리다이렉트 URL 등록 (1분)

**Authentication → URL Configuration**:
- Site URL: `https://emforhs2002-bit.github.io/ssadagu-air-site/`
- Redirect URLs에 같은 주소 추가

## 4. 구글 로그인 연결 (5분)

1. https://console.cloud.google.com → 프로젝트 선택(없으면 생성)
2. **API 및 서비스 → OAuth 동의 화면**: 외부(External), 앱 이름·이메일만 채우고 저장
3. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 유형: **웹 애플리케이션**
   - 승인된 리디렉션 URI: `https://<프로젝트ID>.supabase.co/auth/v1/callback`
     (Supabase **Authentication → Providers → Google** 화면에 정확한 값이 표시돼 있어요)
4. 발급된 **클라이언트 ID / 보안 비밀**을 Supabase **Authentication → Providers → Google**에 붙여넣고 Enable

## 5. 카카오 로그인 연결 (5분)

1. https://developers.kakao.com → 내 애플리케이션 → **애플리케이션 추가**
2. **앱 설정 → 플랫폼 → Web**: 사이트 도메인 `https://emforhs2002-bit.github.io` 등록
3. **제품 설정 → 카카오 로그인** 활성화 → Redirect URI에
   `https://<프로젝트ID>.supabase.co/auth/v1/callback` 등록
4. **카카오 로그인 → 동의항목**: 닉네임·프로필 사진·이메일 동의 설정
5. **앱 설정 → 앱 키**의 **REST API 키** + **제품 설정 → 카카오 로그인 → 보안**의 **Client Secret**(발급 후 활성화)을
   Supabase **Authentication → Providers → Kakao**에 붙여넣고 Enable

## 6. 키 붙여넣고 배포 (1분)

`src/auth.js` 맨 위 두 줄에 1번에서 복사한 값 입력:

```js
export const SUPABASE_URL = 'https://abcd1234.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJ...'
```

커밋·푸시하면 끝. (anon 키는 공개용 키라 저장소에 올려도 안전 — 데이터 접근은 2번의 RLS 정책이 막아줘요)

---

### 동작 방식 요약

- 로그인: Supabase OAuth 리다이렉트 방식 (정적 호스팅에서 동작, 비밀번호 저장 안 함)
- 동기화: 찜(`saved`)·노선찜(`routeWatch`)·알림조건(`alertPrefs`)·여행플랜(`plans`)
  - 로컬에서 바뀔 때마다 1.5초 디바운스 후 서버 업서트
  - 앱 켤 때 서버 데이터로 로컬 갱신, 첫 로그인이면 기존 로컬 데이터를 계정에 시드
- 로그아웃해도 로컬 데이터는 그대로 남아요
