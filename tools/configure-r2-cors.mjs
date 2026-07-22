import { configurePhotoBucketCors, r2Configured } from "../lib/r2-photo-store.mjs";

if (!r2Configured()) {
  console.error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET 환경변수가 필요합니다.");
  process.exitCode = 1;
} else {
  const origins = String(process.env.R2_ALLOWED_ORIGINS || "http://127.0.0.1:8000,http://localhost:8000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  await configurePhotoBucketCors(origins);
  console.log(`R2 CORS 설정 완료: ${origins.join(", ")}`);
}
