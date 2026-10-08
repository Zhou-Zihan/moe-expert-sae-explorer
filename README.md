# MoE Expert & SAE Explorer

用于浏览语料在 Qwen3.5 MoE 各层、各 token 的 expert 路由与 SAE feature 激活的单页研究系统。

前端已建立与设计稿对应的单页分区框架。Data 区域已接入本地语料，展示模型参数、domain 多选与 Samples 搜索；样本短编号只用于显示，查询仍使用完整 ID。Expert Activation Heatmap 已接入单 token 的路由数据，Expert Contexts 展示所选层的 8 个 expert 及其跨样本高权重片段，SAE Features 展示所选 sample、token、layer 的 top-50 feature 与已有语义解释；Projection View 目前只有标题。激活数据与派生索引保存在本地，未提交到 Git。

## 架构约定

- `frontend/`：React + TypeScript + Vite 单页应用。自定义交互可视化将使用 D3；Prettier 统一格式。
- `frontend/` 的界面状态使用 Redux Toolkit（例如当前语料、token、层、筛选条件）。API 数据使用 RTK Query 缓存。新项目不采用已归档的 Rematch。
- `backend/`：Python + FastAPI + Pydantic，当前提供只读 Data API、单 token 的 NPZ 路由查询与 Expert Contexts 索引查询；后续负责更多激活数据查询与轻量预处理。
- `pipeline/`：离线提取 expert 路由和 SAE 激活，并生成查询所需的摘要。目前包含 Expert Contexts 索引生成脚本。
- `data/`：本地数据位置。现有明细为 NPZ，expert 反查索引为 SQLite；跨样本分析需要时可生成 Parquet 并使用 DuckDB。实际数据不提交到 Git。

## 数据契约草案

查询的基本坐标是 `dataset_id / domain_id / sample_id / token_index / layer_index`。路由记录还需包含 `expert_id` 和 `router_weight`；SAE 记录还需包含 `sae_id / hook_point / feature_id / activation`。同时保存模型、tokenizer、SAE 和提取脚本版本，以保证不同实验结果可区分和复现。

只有当 SAE 的编码对象确实是特定 expert 的输出时，才把 feature 标为该 expert 对应的 feature。若 SAE 编码的是层输出或残差流，则按实际 `hook_point` 展示。

## 首版页面目标

语料搜索与样本列表 → 原文及 token 视图 → 层 × token 激活矩阵 → 选中位置的 expert 路由权重和 Top SAE features。

当前页面骨架按 [Figma 设计稿](https://www.figma.com/design/Y0taBPZaoXzEVCCATWT5oj/MoE%E5%8F%AF%E8%A7%A3%E9%87%8A%E6%80%A7?node-id=8-2) 分为左侧 Data 栏与右侧四个视图区：Projection View、Expert Activation Heatmap、Expert Contexts、SAE Features。

## 已实现的 API

- `GET /api/datasets`
- `GET /api/datasets/{dataset_id}/samples?domains=...&query=...`
- `GET /api/datasets/{dataset_id}/domains/{domain_id}/samples?query=...`
- `GET /api/datasets/{dataset_id}/domains/{domain_id}/samples/{sample_id}`
- `GET /api/datasets/{dataset_id}/domains/{domain_id}/samples/{sample_id}/tokens/{token_index}/routing`
- `GET /api/datasets/{dataset_id}/domains/{domain_id}/samples/{sample_id}/tokens/{token_index}/sae-features?layer=...`
- `GET /api/datasets/{dataset_id}/layers/{layer_index}/expert-contexts?domains=...&experts=...`

后续激活数据接口将继续使用相同的 dataset/domain/sample 坐标。前后端类型以 FastAPI 生成的 OpenAPI 为准，后续可从该规范生成 TypeScript 类型。
