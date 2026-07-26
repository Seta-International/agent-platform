# Golden Dataset — Full Setup & Test Runbook

Luồng đầy đủ để dựng golden dataset (planner-query agent eval) rồi chạy test. Chạy
từ **thư mục gốc repo**. Golden dataset là fixture **tất định** (frozen
`REFERENCE_TIME = 2026-07-01T09:00:00+07:00`) gồm 2 tenant: **main** (dữ liệu
chính) và **decoy** (tenant nhiễu để test cách ly cross-tenant).

> Tất cả bước seed đều **destructive-idempotent** trên 2 tenant golden — chạy lại
> bao nhiêu lần cũng ra cùng một kết quả, và không đụng dữ liệu tenant khác.

---

## 0. Yêu cầu trước

- Docker (cho Postgres + pgvector), Node 24 LTS, pnpm.
- Đã cài deps: `pnpm install`.
- File `.env` ở gốc repo có `OPENAI_API_KEY` (chỉ cần cho bước embed — bước 5).
  `DATABASE_URL` mặc định `postgresql://seta:seta@localhost:5542/seta`.

---

## 1. Bật database

```bash
pnpm db:up        # docker compose: khởi động Postgres (pgvector)
pnpm db:migrate   # chạy Drizzle migrations (tạo schema planner/people/core + *_rag)
```

## 2. Seed dữ liệu quan hệ (relational) cho golden

```bash
pnpm seed:golden
```

Ghi cả **main** (`00000000-aaaa-…-0001`) và **decoy** (`…-0002`): people, groups,
plans, tasks, comments, events. In ra số lượng (main ≈ People 50 / Groups 4 /
Tasks 200 / Events 678 / Comments 60).

> Tùy chọn: `pnpm seed:golden:login` — cấp login/product access thật cho actor +
> admin để QA thủ công qua UI. Không bắt buộc cho eval.

## 3. Sinh embeddings (semantic search / people-matching)

```bash
pnpm seed:golden:embed
```

- Cần `OPENAI_API_KEY`. Dùng **OpenAI Batch API** (bất đồng bộ, có thể vài phút →
  tối đa 24h) — **giữ tiến trình chạy tới khi xong**, đừng kill giữa chừng.
- Embed **cả 2 tenant**: main (task 200 / people 50) và decoy (task 2 / people 2),
  để test rò rỉ cross-tenant có vector thật mà đối chiếu.
- Model mặc định `openai/text-embedding-3-small` (đổi qua `EMBED_MODEL`).
- Idempotent: vector upsert theo id tất định, chạy lại không nhân đôi.

> Chỉ cần bước này nếu test có semantic search (PQ-007) hoặc chạy **preflight với
> kiểm tra embeddings**. Fact oracle (bước 4) **không** cần embeddings.

## 4. Đối chiếu / cập nhật fact manifest

Oracle SQL thô (`generate-facts.ts`) tái tạo ground-truth từ DB đã seed, so với
file đã commit `packages/planner/tests/fixtures/golden/manifests/golden-facts.json`.

```bash
pnpm golden:facts:diff       # so DB hiện tại vs manifest; exit 1 nếu lệch (drift)
```

- Kết quả mong đợi sau seed sạch: `no drift`.
- Nếu bạn **cố ý** đổi seed (sửa fixture) → xem diff, rồi:

```bash
pnpm golden:facts:generate > /tmp/golden-facts.candidate.json   # xem tay
pnpm golden:facts:promote                                        # ghi đè manifest (human review)
```

`promote` chỉ chạy thủ công sau khi review — CI không bao giờ tự ghi manifest.
Nếu đổi seed, nhớ cập nhật `seedChecksum` + counts trong
`manifests/dataset.json` (preflight sẽ kiểm tra).

## 5. Preflight — chốt chặn trước khi eval

`preflightGolden(pool)` khẳng định DB đúng bằng dataset đã đóng băng: facts khớp
manifest, seedChecksum khớp, row-counts (main+decoy), cách ly canary (không có
canary decoy trong tenant main), và (tùy chọn) bất biến embeddings. Ném
`Error('PREFLIGHT: …')` nếu lệch. Hiện gọi bằng code (chưa có lệnh pnpm riêng):

```bash
# facts + counts + isolation, KHÔNG cần embeddings:
pnpm exec tsx -e "import pg from 'pg'; import { preflightGolden } from './packages/planner/tests/fixtures/golden/oracles/preflight.ts'; const pool=new pg.Pool({connectionString:process.env.DATABASE_URL??'postgresql://seta:seta@localhost:5542/seta'}); preflightGolden(pool,{checkEmbeddings:false}).then(r=>console.log('OK',r)).catch(e=>{console.error(String(e));process.exit(1)}).finally(()=>pool.end());"
```

Bỏ `{ checkEmbeddings: false }` (mặc định `true`) để kiểm tra luôn embeddings —
chỉ chạy được **sau bước 3**.

> Toàn bộ pipeline reset→seed→embed→preflight→eval nên được bọc trong
> `withGoldenLock(pool, …)` (advisory lock Postgres) để không có 2 lần chạy chồng
> lên nhau trên cùng DB.

## 6. Chạy test

```bash
# Unit (schema, loader, ir-metrics, metric-policy, migration, embedding-invariants, facts-diff):
pnpm exec vitest run --root packages/planner tests/unit/golden/

# Integration (testcontainers tự dựng Postgres riêng — độc lập DB dev ở trên):
pnpm exec vitest run --root packages/planner tests/integration/golden/

# Smoke toàn dataset:
pnpm exec vitest run --root packages/planner tests/integration/golden-dataset-smoke.test.ts
```

Lưu ý: test **integration/unit dùng testcontainers** tự seed trong container riêng,
nên bước 1–5 ở trên chủ yếu phục vụ **eval thật + QA thủ công**, không phải điều
kiện tiên quyết để `vitest` xanh.

---

## Reset nhanh

```bash
pnpm db:reset        # xoá volume, up lại, migrate, seed lõi (KHÔNG gồm golden)
pnpm seed:golden     # seed lại golden 2 tenant
pnpm seed:golden:embed  # (nếu cần semantic/preflight-embeddings)
```

## Tóm tắt 1 dòng cho eval đầy đủ

```bash
pnpm db:up && pnpm db:migrate && pnpm seed:golden && pnpm seed:golden:embed && pnpm golden:facts:diff
```

## Tham chiếu

- Fixtures: `packages/planner/tests/fixtures/golden/`
- Manifests: `…/golden/manifests/{golden-facts,dataset,landmark-entities}.json`, `coverage-matrix.md`
- Test cases (YAML): `…/golden/cases/{factual,edge,adversarial,rbac}.yaml`
- Oracle & preflight & lock: `…/golden/oracles/`
