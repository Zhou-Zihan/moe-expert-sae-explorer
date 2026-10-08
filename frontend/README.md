# Frontend

Projection View 从后端读取预计算的 token 坐标，以 domain 着色；所有轨迹淡化显示，当前 sample 高亮。鼠标滚轮缩放、拖动平移，点击点可选择 sample/token 并联动热图。方向键可在已选 sample 的相邻 token 间移动。首次查看前，按 `backend/README.md` 运行投影预计算脚本。

二维距离只是高维 expert 选择相似度的近似；轨迹线表示 token 顺序。

React + TypeScript + Vite 的单页应用。Data 区域已接入后端，按设计稿展示模型信息、domain 筛选与 Samples 列表；样本以 `#000` 等短编号显示，内部仍使用完整 ID。Expert Activation Heatmap 使用 D3 色标显示当前 sample 的示例 token（暂为索引 42）在 48 层的 expert routing；点击一层会把 sample、token、layer 和 8 个 expert 的权重保存在 Redux。Expert Contexts 按当前 token 的权重排序 8 张卡片，每张卡片从后端派生索引读取 15 条不同 sample 的高权重片段；切换层时无需重新查询所选 token 的 routing。SAE Features 从 shard 读取当前 sample、token、layer 的 top-50 feature，并匹配已有的语义解释；缺失的解释保持空白。Projection View 目前仍为空容器。

页面画布固定为 1920×1080，不做窄屏重排；浏览器视口较小时可滚动查看完整页面。

热力图默认将权重 0–0.4 映射为浅色到深色，超过 0.4 的值饱和显示；按钮可切换到完整 0–1 范围。图例始终显示当前映射的真实上限。未来投影视图选择 token 时，向 Redux 派发 `selectToken(tokenIndex)` 即可更新热力图。

界面共享选择状态由 Redux Toolkit 管理，API 数据由 RTK Query 查询和缓存。
当只选择一个 domain 时不显示 Expert Contexts 的 Domain mix；每张卡片的示例列表可滚动，但滚动条隐藏。

## 本地运行

先按 `backend/README.md` 启动后端。另开一个终端，进入 `frontend/`，使用 Node.js 22：

```bash
nvm use
npm ci
npm run dev
```

构建和格式检查：

```bash
npm run build
npm run format:check
```
