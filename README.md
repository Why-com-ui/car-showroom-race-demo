# car-showroom-race-demo

<p align="center">
  <img src="https://img.shields.io/badge/Vite-7.x-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Three.js-0.182-111111?style=for-the-badge&logo=three.js&logoColor=white" alt="Three.js" />
  <img src="https://img.shields.io/badge/GitHub_Pages-Ready-121013?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Pages" />
</p>

<p align="center">
  一个基于 <code>Vite + Three.js</code> 的 3D 汽车展厅与竞速 Demo。<br />
  项目包含展厅浏览、车辆切换、视角控制、比赛流程、HUD 与结果页，适合作为前端 3D 作品展示。
</p>

<p align="center">
  <a href="https://why-com-ui.github.io/car-showroom-race-demo/">在线演示</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#操作说明">操作说明</a> ·
  <a href="#github-pages-部署">GitHub Pages 部署</a>
</p>

---

## 项目简介

`car-showroom-race-demo` 是这个仓库的项目名，它比原先的名字更直观，也更准确地表达了这个项目的内容。

整体体验包括：

- 主菜单与进入动画
- 3D 展厅浏览与车辆切换
- 车辆材质与部分场景效果调节
- 倒计时进入比赛
- 比赛 HUD、视角切换、车辆重置与结果页

## 在线演示

GitHub Pages 地址：

**https://why-com-ui.github.io/car-showroom-race-demo/**

## 项目亮点

- 使用 `Three.js` 构建完整 3D 场景与交互流程
- 展厅、比赛、HUD、结果页之间切换完整
- 支持 `W/A/S/D`、方向键、`C`、`R`、`Esc` 等键盘控制
- 适合部署到 GitHub Pages 做公开展示
- 目录结构清晰，便于继续扩展内容与玩法

## 技术栈

| 类别 | 说明 |
| --- | --- |
| 构建工具 | Vite |
| 3D 引擎 | Three.js |
| 界面层 | 原生 DOM + CSS |
| 调试面板 | dat.gui |
| 部署方式 | GitHub Pages + GitHub Actions |

## 快速开始

```bash
npm install
npm run dev
```

构建与预览：

```bash
npm run build
npm run preview
```

## 操作说明

展厅场景：

- 鼠标拖拽：旋转视角
- 鼠标滚轮：缩放镜头
- 左右按钮：切换车辆
- 右上角面板：调整车辆材质与部分场景效果

比赛场景：

- `W / A / S / D` 或方向键：驾驶
- `Space`：手刹
- `C`：切换视角
- `R`：重置车辆
- `Esc`：结束比赛并进入结果页

## 项目结构

```text
src/
  core/      # 应用核心、状态与输入管理
  scenes/    # 菜单、展厅、比赛等场景
  ui/        # HUD、菜单、结果页等界面
  styles/    # 全局样式与 UI 样式
public/      # 模型等静态资源
```

## GitHub Pages 部署

项目已按 GitHub Pages 子路径部署方式配置，仓库名固定为 `car-showroom-race-demo` 时，线上地址为：

`https://why-com-ui.github.io/car-showroom-race-demo/`

如需重新部署：

```bash
npm run build
```

推送到 GitHub 后，Pages 工作流会自动构建并发布站点。
