# MoE Expert & SAE Explorer

用于浏览语料在 Qwen3.5 MoE 各层、各 token 的 expert 路由与 SAE feature 激活的单页研究系统。

本仓库目前只包含项目约定和目录占位；尚未实现前端、API 或数据处理，也未包含模型和实验数据。

## 架构约定

- `frontend/`：React + TypeScript 单页应用。自定义交互可视化使用 D3；Prettier 统一格式。
- `frontend/` 的界面状态使用 Redux Toolkit（例如当前语料、token、层、筛选条件）。API 数据使用 RTK Query 缓存。新项目不采用已归档的 Rematch。
- `backend/`：Python + FastAPI + Pydantic，负责分页查询和轻量预处理，不在普通页面请求中运行模型推理。
- `pipeline/`：离线提取 expert 路由和 SAE 激活，并生成查询所需的摘要。
- `data/`：本地数据位置。激活数据优先评估 Parquet + DuckDB；模型权重、原始语料和生成数据不提交到 Git。

## 数据契约草案

查询的基本坐标是 `dataset_id / sample_id / token_index / layer_index`。路由记录还需包含 `expert_id` 和 `router_weight`；SAE 记录还需包含 `sae_id / hook_point / feature_id / activation`。同时保存模型、tokenizer、SAE 和提取脚本版本，以保证不同实验结果可区分和复现。

只有当 SAE 的编码对象确实是特定 expert 的输出时，才把 feature 标为该 expert 对应的 feature。若 SAE 编码的是层输出或残差流，则按实际 `hook_point` 展示。

## 首版页面目标

语料搜索与分页列表 → 原文及 token 视图 → 层 × token 激活矩阵 → 选中位置的 expert 路由权重和 Top SAE features。

## 首版 API 草案

- `GET /api/datasets`
- `GET /api/samples?dataset_id=...&cursor=...&query=...`
- `GET /api/samples/{sample_id}`
- `GET /api/samples/{sample_id}/activations?layer=...`
- `GET /api/experts/{expert_id}/summary?dataset_id=...&layer=...`

前后端类型以 FastAPI 生成的 OpenAPI 为准，前端从该规范生成 TypeScript 类型。
