# PM — KPI Metrics & Weekly Reports: spec coverage

**Living doc.** Đối chiếu spec business (tóm tắt theo mockup `docs/weekly.html` + SOP SETA-08-SOP-001 v2.0) với code thực tế của `packages/pm` / `packages/web-pm`. **Mỗi lần code các mảng này thay đổi, cập nhật lại bảng % và ghi một dòng vào Changelog cuối file.** Con số % là ước lượng theo đầu mục spec, không phải LOC.

Cập nhật lần cuối: **2026-07-22** (nhánh `fix/FUT-740-pm-ui-style-fixes`, working tree chưa commit).

## Bảng tổng

| Mục spec | Mức đáp ứng | Ghi chú ngắn |
|---|---|---|
| 1. Kiến trúc: 1 thư viện norm, 3 màn ăn khớp | **~90%** | Đúng thiết kế; compute dùng chung client/server |
| 2. KPI Norm — thư viện định nghĩa | **~90%** | Lens + Executive đã có (2026-07-22); thiếu workflow hành động |
| 3. KPI Explorer — đo đạc | **~80%** | Thiếu "Live · auto"; chỉ hiện Core, cap 3/pillar |
| 4. Configure KPI Metrics | **~85%** | **Lệch mô hình**: code per-project, spec ghi global |
| 5. Weekly Reports | **~85%** | Thiếu norm-check line trên project card |
| 6. Performance (hệ liền kề) | **0%** | Chưa build |
| **Tổng (mục 1–5)** | **~86%** | |
| **Tổng kể cả Performance** | **~70%** | |

## Chi tiết & bằng chứng

### 1. Kiến trúc tổng thể — ~90%
Norm là nguồn chuẩn duy nhất (`pm.kpi_norm` + `kpi_norm_metric`); hàm chấm màu sống trong `packages/pm/src/contracts.ts` và được cả web lẫn backend import chung ("client preview and server-settled colour can never disagree" — `kpi-health.ts`). Explorer, Norm tab, Weekly Reports cùng band; Weekly chấm theo baseline tuần đã freeze (`kpi_norm_baseline`, FUT-593).

### 2. KPI Norm — ~90%
- Trọng số OHS đúng từng số: Q 25 · C 35 · D 25 · P 15 (`kpi-health.ts` `OHS_WEIGHTS`); scoring Green=100/Yellow=70/Red=0 (`OHS_POINTS`); pillar = trung bình Core; RAG hành động ≥90 / 70–89 / <70 (`ohsRag`).
- ~44 metrics Core (20) / Extended (24), đủ tên · formula · 3 band · insight (`kpi-norm-data.ts`).
- "No Data = No Management": pillar 0 data → Red (`contracts.ts` `computeCategoryHealth`); project chọn subset, không override norm.
- **Methodology lens** (5.1 Scrum 7 · 5.2 Kanban 8 · 5.3 Waterfall 6 · 5.4 Hybrid 6) và **Executive EQI/TDI + cảnh báo 2×2 "Fake Healthy System"**: hiển thị tham khảo trong Norm tab đúng mockup (`packages/pm/src/kpi-norm-reference.ts`, render ở `kpi-norm-tab.tsx`) — thêm 2026-07-22.
- Còn thiếu: workflow hành động sau RAG (corrective plan ≤48h, escalate Steering, RCA 5 ngày) — mới chỉ có ngưỡng màu; đo đạc EQI/TDI theo quý + vẽ ma trận (hiện chỉ là bảng định nghĩa).

### 3. KPI Explorer — ~80%
Có: filter Week/Account/Project; 1 dòng = project×tuần; cột group theo pillar có màu; norm dưới tên cột; cell chấm màu; manual input nhập tử/mẫu theo component label, value+status+QCDP+RAG tính live bằng đúng hàm contracts, lưu theo project×week (optimistic version), tag "Manual · saved".
Thiếu: tag "Live · auto" (deferred có chủ đích — comment trong `kpi-shared.tsx`); Explorer chỉ hiện Core và cap 3 metric/pillar.

### 4. Configure — ~85%, lệch mô hình
Spec ghi "một bộ cấu hình global, chưa per-project" nhưng code **đã per-project** (`kpi-configure-dialog.tsx`: project list + select-all + coverage checkbox; `setAppliedMetric(metricId, applied, project_ids)`; project mới auto-bật Core qua subscriber `kpi-core-metrics-project-created.ts`). Cần chốt lại spec theo code hoặc ngược lại. Khớp spec: map 1:1 thư viện norm, Core mặc định bật & khoá, Extended tuỳ chọn (tắt có confirm), tag "Applied" bên Norm tab. Tag "Live column" có render nhưng chưa điều khiển cột Explorer thật (đi cùng phần live deferred).

### 5. Weekly Reports — ~85%
Có: account → project; QCDP declared theo norm (computed chỉ prefill); overall = worst pillar; gate submit: summary bắt buộc, KPI over norm cấm all-Green, non-Green bắt buộc Road-to-Green + due (và Green thì discard Road-to-Green — fix 2026-07-22); draft/submit/revision/demote/comment-freeze; flags override có audit; rollup + OHS.
Thiếu: **norm-check line trên từng project card** ("x/y KPIs in norm · n Amber · n Red · worst: metric + giá trị + norm") — data `stats` đã có từ API, card đang hiển thị delivery pulse thay thế.

### 6. Performance — 0%
Chưa có gì: không có đánh giá tháng, chuỗi BoD→AM→EM/TL→member, heatmap, self-assessment, acknowledge — ở cả `pm`, `web-pm`, `people`, `web-people`.

## Gap cần chốt với PMO

1. Configure: global (spec) vs per-project (code) — chốt một hướng.
2. Live/auto data cho Explorer + "LIVE COLUMN" điều khiển cột — đang stub.
3. Norm-check line trên Weekly Report card — gap nhỏ, data sẵn.
4. Đo đạc EQI/TDI theo quý + Executive Matrix — hiện mới là bảng định nghĩa.
5. Performance — hệ lớn chưa bắt đầu.

## Changelog

| Ngày | Thay đổi | % tổng (1–5) |
|---|---|---|
| 2026-07-22 | Báo cáo đầu tiên; cùng ngày: thêm Methodology lens + Executive vào Norm tab (mục 2: 70→90), fix Green-discard-Road-to-Green (mục 5) | ~86% |
