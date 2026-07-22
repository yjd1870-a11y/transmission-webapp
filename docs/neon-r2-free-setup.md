# Neon Free + Cloudflare R2 Free 설정

이 앱은 `DATABASE_URL`이 있으면 사용자 계정과 공용 데이터를 Neon PostgreSQL에 저장하고, R2 환경변수가 모두 있으면 현장사진을 비공개 R2 버킷에 저장합니다. 환경변수가 없을 때는 로컬 개발을 위해 기존 파일·Base64 저장 방식으로 동작합니다.

## 1. Neon Free 데이터베이스

1. Neon에서 Free 프로젝트를 만들고 가능한 경우 Singapore 리전을 선택합니다.
2. 프로젝트의 **Connect** 화면에서 **Pooled connection**을 선택합니다.
3. `-pooler`가 포함된 연결 문자열을 복사합니다.
4. Render 서비스의 Environment에 다음 값을 등록합니다.

```text
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require&channel_binding=require
```

서버가 처음 실행될 때 필요한 테이블을 자동 생성하고 현재 `data/auth-users.json`과 `assets/shared-db.json`을 한 번만 가져옵니다. 이후 데이터는 Neon이 기준입니다.

## 2. Cloudflare R2 Standard 버킷

1. Cloudflare Dashboard에서 R2를 활성화합니다.
2. `ratis-photos`라는 **Standard** 버킷을 만들고 공개 액세스는 끈 상태로 유지합니다.
3. R2 API Token에서 해당 버킷에 대한 **Object Read & Write** 토큰을 만듭니다.
4. Render Environment에 다음 값을 등록합니다.

```text
R2_ACCOUNT_ID=Cloudflare 계정 ID
R2_ACCESS_KEY_ID=R2 Access Key ID
R2_SECRET_ACCESS_KEY=R2 Secret Access Key
R2_BUCKET=ratis-photos
```

키는 Vercel 환경변수나 프론트엔드 코드에 넣지 않습니다. Render 백엔드에만 저장합니다.

## 3. R2 CORS

브라우저가 서명된 URL로 R2에 직접 PUT할 수 있도록 버킷 CORS에 아래 규칙을 등록합니다. 실제 Vercel 주소가 다르면 바꿉니다.

```json
[
  {
    "AllowedOrigins": [
      "https://transmission-webapp.vercel.app",
      "http://127.0.0.1:8000",
      "http://localhost:8000"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

또는 버킷 CORS를 수정할 수 있는 Admin 토큰을 일시적으로 환경변수에 넣은 로컬 터미널에서 실행할 수 있습니다.

```powershell
$env:R2_ALLOWED_ORIGINS='https://transmission-webapp.vercel.app,http://127.0.0.1:8000,http://localhost:8000'
npm run r2:configure-cors
```

설정 후 Admin 토큰은 폐기하고 Render에는 Object Read & Write 토큰만 사용합니다.

## 4. Render Starter 백엔드

`render.yaml`은 기존 Starter 웹 서비스와 1GB 영구 디스크를 유지하면서 외부 Neon/R2를 사용하도록 구성되어 있습니다.

Render에 아래 여섯 값을 모두 넣은 다음 재배포합니다.

```text
RATIS_MASTER_KEY
DATABASE_URL
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
```

배포 후 다음 주소에서 연결 모드를 확인합니다.

```text
https://ratis-transmission-webapp-yjd1870.onrender.com/api/health
```

정상 설정 예시:

```json
{
  "ok": true,
  "apiVersion": "neon-r2-v2",
  "database": "neon",
  "photoStorage": "r2",
  "r2ConfigurationComplete": true
}
```

## 5. 작동 방식

- 사진 등록: 로그인 확인 → Render가 5분짜리 R2 PUT URL 발급 → 브라우저가 R2에 직접 업로드 → Neon에 메타데이터 확정
- 사진 조회: 로그인 확인 → Render가 10분짜리 R2 GET URL 발급 → 브라우저 리다이렉트
- 사진 삭제·교체: R2 객체와 Neon 메타데이터를 함께 정리
- 사진 크기: 브라우저에서 최대 900px JPEG로 압축하며 서버는 장당 10MB를 초과하면 거부
- 사진 수: CELL별 ONU 3장, UPS 3장

무료 한도를 지키려면 R2 버킷은 `Standard`를 사용하고 원본 사진을 별도로 중복 보관하지 않습니다.
