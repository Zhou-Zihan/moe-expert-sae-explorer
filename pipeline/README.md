# Pipeline

离线提取 Qwen3.5 MoE 的 token 级 expert 路由及指定 hook point 的 SAE 激活，并生成前端查询使用的摘要数据。提取流程须记录模型、tokenizer、SAE 和脚本版本。

当前 `build_expert_contexts.py` 从 NPZ shard 和 `expert_summary.csv` 生成 Expert Contexts 所需索引：

```bash
backend/.venv/bin/python pipeline/build_expert_contexts.py data/pilecc_300
```

输出到同目录的 `expert_contexts.json`。每个 `(sample, layer, expert)` 只保留最高 routing weight 的 token；相同权重时选较早的 token。每个 `(layer, expert)` 最终存储最多 15 条不同 sample 的记录。新增 domain 后对其数据目录分别运行此脚本。
