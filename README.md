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

`3d-project` 是一个基于 Vite + Three.js 开发的 3D 汽车展厅与竞速 Demo。项目包含主菜单、车辆展厅、参数调节、比赛场景、HUD 和结果页，整体体验比较完整，适合用来做前端 3D 作品展示，也支持部署到 GitHub Pages 在线查看。

当前项目已经完成了 GitHub Pages 兼容处理，包括：

- 生产环境 `base` 路径配置
- `public/` 静态资源路径统一处理
- GitHub Actions 自动构建与部署工作流
- 面向仓库展示的 README 与项目说明

## 在线演示

仓库名固定为 `3d-project`，因此 GitHub Pages 展示地址写死为：

**在线地址：**  
https://why-com-ui.github.io/3d-project/



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



