# 3d-project

<p align="center">
  <img src="https://img.shields.io/badge/Vite-7.x-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Three.js-0.182-111111?style=for-the-badge&logo=three.js&logoColor=white" alt="Three.js" />
  <img src="https://img.shields.io/badge/GitHub_Pages-Ready-121013?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Pages" />
</p>

<p align="center">
  一个用于 GitHub 展示的 3D 汽车展厅与竞速 Demo。<br />
  基于 <code>Vite + Three.js</code> 构建，包含展厅浏览、车辆切换、镜头控制、比赛流程、HUD 与结果页。
</p>

<p align="center">
  <a href="#在线演示">在线演示</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#操作说明">操作说明</a> ·
  <a href="#github-pages-部署">GitHub Pages 部署</a>
</p>

---

## 项目概览

`3d-project` 不是一个单纯的模型展示页，而是一个完整的小型 3D 前端作品。它把“从进入菜单，到浏览展厅，再到进入比赛”的整条体验链做了起来，更适合放在 GitHub 仓库首页、作品集或在线演示页面中展示。

当前项目已经完成了 GitHub Pages 兼容处理，包括：

- 生产环境 `base` 路径配置
- `public/` 静态资源路径统一处理
- GitHub Actions 自动构建与部署工作流
- 面向仓库展示的 README 与项目说明

## 在线演示

仓库名固定为 `3d-project`，因此 GitHub Pages 展示地址写死为：

**在线地址：**  
https://why-com-ui.github.io/3d-project/

说明：

- 当仓库推送到 GitHub 并启用 Pages 后，这个地址会直接作为项目演示入口
- 如果刚推送完代码，GitHub Actions 可能需要几十秒到几分钟完成首次部署
- 如果以后修改仓库名，需要同步修改 [vite.config.js](./vite.config.js) 中的 `base` 配置

## 项目亮点

- 3D 展厅场景：带镜面地面、体积光、粒子和辉光效果
- 车型切换体验：支持不同车辆模型和展厅内切换逻辑
- 参数可调：可通过 `dat.gui` 调整材质和部分场景效果
- 比赛流程完整：包含倒计时、比赛场景、HUD 与结果页
- 结构清晰：`core / scenes / ui` 分层明确，适合继续扩展
- 适合公开展示：本地开发、构建产物和 GitHub Pages 部署路径都已整理完成

## 体验流程

1. 进入主菜单
2. 切换到 3D 汽车展厅
3. 浏览车辆、切换视角、调整参数
4. 进入比赛倒计时
5. 在赛道中驾驶并查看 HUD 信息
6. 结束后进入结果页

## 技术栈

| 类别 | 使用内容 |
| --- | --- |
| 构建工具 | Vite |
| 3D 引擎 | Three.js |
| 界面层 | 原生 DOM + CSS |
| 调试面板 | dat.gui |
| 部署方式 | GitHub Pages + GitHub Actions |

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

### 构建与预览

```bash
npm run build
npm run preview
```

## 操作说明

### 展厅场景

- 鼠标拖拽：旋转视角
- 鼠标滚轮：缩放镜头
- 左右切换按钮：切换车辆
- 右上角调试面板：调整车辆材质与展厅效果

### 比赛场景

- `W / A / S / D` 或方向键：驾驶
- `C`：切换视角
- `R`：重置车辆
- `Esc`：退出比赛并进入结果页

## 项目结构

```text
src/
├─ core/        # 应用核心、输入系统、状态机、资源管理
├─ scenes/      # 菜单、展厅、比赛场景与相关系统
├─ ui/          # 菜单、HUD、结果页等界面层
└─ styles/      # 全局样式与 UI 样式

public/
├─ car1.glb
├─ car2.glb
└─ vite.svg
```

## GitHub Pages 部署

仓库已经包含 GitHub Actions 工作流文件：  
[.github/workflows/deploy.yml](./.github/workflows/deploy.yml)

部署流程：

1. 将项目推送到 GitHub 仓库 `3d-project`
2. 打开仓库 `Settings > Pages`
3. 将 `Source` 设置为 `GitHub Actions`
4. 推送到 `main` 分支
5. 等待 Actions 自动构建并发布

部署完成后，项目会自动显示在：

```text
https://why-com-ui.github.io/3d-project/
```

## GitHub Pages 兼容说明

为了确保这个项目在 GitHub Pages 的项目站点模式下能够稳定运行，仓库里已经做了以下处理：

- 使用 [vite.config.js](./vite.config.js) 固定生产环境 `base` 为 `/3d-project/`
- 通过 `BASE_URL` helper 生成 `public/` 资源路径
- 构建后的静态资源会自动带上正确前缀
- 通过 GitHub Actions 直接部署 `dist` 产物

如果你之后继续新增 `public/` 下的资源，建议保持同样的路径处理方式，不要直接手写根路径。

## 后续可扩展方向

- 增加更多车型、材质和轮毂配置
- 为比赛加入排名、计圈或计时挑战
- 增加音效、加载动画和过场表现
- 为仓库补充截图或 GIF，让 GitHub 首页更完整

## License

当前仓库还没有附带许可证文件。  
如果准备公开发布，建议补充一个明确的 `LICENSE` 文件。
