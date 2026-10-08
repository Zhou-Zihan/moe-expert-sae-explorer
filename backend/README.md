# Backend

FastAPI + Pydantic 提供只读接口。样本目录来自 `data/pilecc_300/samples.jsonl`，首次读取后缓存于进程内；单个 token 的 expert routing 从对应的 NPZ shard 读取。SQLite 索引暂未接入接口。

Expert Contexts 使用 `data/pilecc_300/expert_contexts.json` 派生索引。首次运行前，在项目根目录生成：

```bash
backend/.venv/bin/python pipeline/build_expert_contexts.py data/pilecc_300
```

Projection View 使用 `data/pilecc_300/projection.npz`。安装依赖后，在项目根目录生成一次：

```bash
backend/.venv/bin/python pipeline/build_projection.py pilecc_300
```

每个有效 token 转换为 `层数 × expert 数` 的稀疏二值向量，每层 top-8 被选中的 expert 记为 1。默认先用 64 维 TruncatedSVD 加速，再用余弦距离和 UMAP，一次性投影该 dataset 的所有 domain；可传 `--svd-components 0` 直接对原始稀疏向量运行 UMAP。相邻 token 的连线只在前端绘制，不参与降维。生成文件属于本地数据，不提交 Git。增删 domain 或更换 shard 后重新运行脚本，所有 domain 共用同一坐标空间。首次计算可能需要较长时间。

轨迹视图参考 [Projection Space Explorer](https://github.com/jku-vds-lab/projection-space-explorer) 的“点、序列、元数据”组织方式：sample ID 是轨迹 ID，token index 是轨迹顺序，domain 决定颜色。

索引对每个 `(layer, expert, sample)` 保留最高 routing weight 的 token，然后每个 expert 取权重最高的 15 条不同 sample；卡片的 tokens 数量来自 `expert_summary.csv` 的 `selection_count`。索引属于本地数据，不提交到 Git。

## 本地运行

需要 Python 3.12。在项目根目录执行（明确指定版本，避免 Conda `base` 的旧版 `python3`）：

```bash
/opt/homebrew/bin/python3.12 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
backend/.venv/bin/python -m uvicorn backend.app.main:app --reload --port 8000
```

接口文档位于 `http://localhost:8000/docs`。同时运行前端的 `npm run dev`，Vite 会把 `/api` 请求代理到后端。

## Data API

- `GET /api/datasets`：数据集的模型、路由、SAE 参数，以及所属 domain 的颜色与样本数量。
- `GET /api/datasets/{dataset_id}/projection?domains=pilecc`：预计算的二维 token 坐标，按 sample 和 token 顺序分组；domain 过滤不会重新拟合投影。
- `GET /api/datasets/{dataset_id}/samples?domains=...&query=...`：按多个 domain 筛选样本；`query` 搜索全文、ID 和原始 token。
- `GET /api/datasets/{dataset_id}/domains/{domain_id}/samples?query=...`：单个 domain 的样本列表；同样支持全文、ID 和 token 搜索。
- `GET /api/datasets/{dataset_id}/domains/{domain_id}/samples/{sample_id}`：单条样本全文、tokens 和来源元数据。
- `GET /api/datasets/{dataset_id}/domains/{domain_id}/samples/{sample_id}/tokens/{token_index}/routing`：该 token 在每层选中的 expert ID、rank 和 routing weight。
- `GET /api/datasets/{dataset_id}/domains/{domain_id}/samples/{sample_id}/tokens/{token_index}/sae-features?layer=30`：从对应 NPZ shard 读取该层 top-50 SAE feature ID 和激活值，并按 layer、feature ID 匹配 `data/sae_feature_explanations` 下的 `explanation`。无解释时 `semantics` 为 `null`。
- `GET /api/datasets/{dataset_id}/layers/{layer_index}/expert-contexts?domains=pilecc&experts=116,88,...`：每个 expert 的总选择次数及最多 15 条不同 sample 的高权重上下文片段。

增加数据集或 domain 时，在 `backend/app/data_catalog.py` 的 `DATASETS` 中登记 ID、名称和对应的 `samples.jsonl` 路径；前端选择器从接口生成选项。若正在运行后端，更新目录配置后需重启服务。
