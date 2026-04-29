'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { getModelColor, ModelConfig } from '@/types/medical';
import { WBOITRenderer } from '@/lib/wboit';

interface ModelMesh {
  name: string;
  mesh: THREE.Mesh;
  material: THREE.MeshPhongMaterial;
  visible: boolean;
}

interface ThreeDViewerProps {
  models: ModelConfig[];
  onVolumesLoaded?: (volumes: number[]) => void;
}

// 手动解析ASCII STL格式
function parseASCIISTL(text: string): THREE.BufferGeometry {
  const vertices: number[] = [];
  const normals: number[] = [];
  
  const faceRegex = /facet\s+normal\s+([\-+]?[\d]+\.?[\d]*)\s+([\-+]?[\d]+\.?[\d]*)\s+([\-+]?[\d]+\.?[\d]*)\s+outer\s+loop([\s\S]*?)endloop\s+endfacet/g;
  
  let faceMatch;
  while ((faceMatch = faceRegex.exec(text)) !== null) {
    const nx = parseFloat(faceMatch[1]);
    const ny = parseFloat(faceMatch[2]);
    const nz = parseFloat(faceMatch[3]);
    const vertexBlock = faceMatch[4];
    
    const vertexRegex = /vertex\s+([\-+]?[\d]+\.?[\d]*)\s+([\-+]?[\d]+\.?[\d]*)\s+([\-+]?[\d]+\.?[\d]*)/g;
    let vertexMatch;
    let vertexCount = 0;
    
    while ((vertexMatch = vertexRegex.exec(vertexBlock)) !== null) {
      vertexCount++;
      vertices.push(
        parseFloat(vertexMatch[1]),
        parseFloat(vertexMatch[2]),
        parseFloat(vertexMatch[3])
      );
    }
    
    if (vertexCount === 3) {
      normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    }
  }
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  if (normals.length > 0) {
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  }
  
  if (normals.length === 0 || vertices.length === 0) {
    geometry.computeVertexNormals();
  }
  
  return geometry;
}

// 计算闭合三角网格体积（有符号体积法）
// V = (1/6) * Σ (v1 × v2) · v3
function calculateVolume(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position');
  if (!position) return 0;

  let volume = 0;
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();
  const cross = new THREE.Vector3();

  for (let i = 0; i < position.count; i += 3) {
    v1.fromBufferAttribute(position, i);
    v2.fromBufferAttribute(position, i + 1);
    v3.fromBufferAttribute(position, i + 2);

    cross.crossVectors(v1, v2);
    volume += cross.dot(v3);
  }

  return Math.abs(volume) / 6;
}

export default function ThreeDViewer({ models, onVolumesLoaded }: ThreeDViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: TrackballControls;
    meshes: ModelMesh[];
    axesGroup: THREE.Group;
    gizmoScene: THREE.Scene;
    gizmoCamera: THREE.OrthographicCamera;
    gizmoAxes: THREE.Group;
    wboitRenderer: WBOITRenderer;
    animationId: number;
  } | null>(null);
  // 手动保存初始相机状态，用于复位
  const savedCameraState = useRef<{
    position: THREE.Vector3;
    up: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  
  // 追踪模型是否已加载完成
  const modelsLoadedRef = useRef(false);
  // 初始models快照，用于比较属性变化
  const initialModelsRef = useRef<ModelConfig[]>([]);
  // 防抖定时器
  const centerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // UI 控制状态
  const [axesVisible, setAxesVisible] = useState(false);
  const [bgColorIndex, setBgColorIndex] = useState(2); // 0:黑 1:灰 2:白(默认)
  // 使用 useRef 避免每次渲染创建新数组
  const bgColorsRef = useRef(['#000000', '#808080', '#ffffff']);
  const bgLabelsRef = useRef(['黑', '灰', '白']);

  // 创建场景的核心逻辑（不依赖 useCallback）
  const setupScene = useCallback((container: HTMLDivElement) => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
    camera.position.set(200, 200, 200);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 50);
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-50, -50, -50);
    scene.add(directionalLight2);

    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 2.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = false;
    controls.dynamicDampingFactor = 0.15;

    // 添加XYZ坐标轴（箭头），默认隐藏
    const axesGroup = new THREE.Group();
    const axisLen = 40;
    const headLen = axisLen * 0.15;
    const headWidth = axisLen * 0.08;
    axesGroup.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), axisLen, 0xEF4444, headLen, headWidth));
    axesGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), axisLen, 0x22C55E, headLen, headWidth));
    axesGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), axisLen, 0x3B82F6, headLen, headWidth));
    axesGroup.visible = false;
    scene.add(axesGroup);

    // --- Orientation Gizmo（左下角坐标轴指示器）---
    const gizmoViewPx = 130; // 视口像素尺寸
    const gizmoFrustum = 80; // 正交相机半视锥（世界单位）
    const gizmoScene = new THREE.Scene();

    // 正交相机始终固定，位置 & 朝向不变 → 原心永远居中
    const gizmoCamera = new THREE.OrthographicCamera(
      -gizmoFrustum, gizmoFrustum,
      gizmoFrustum, -gizmoFrustum,
      0.1, 1000
    );
    gizmoCamera.position.set(0, 0, 300);
    gizmoCamera.lookAt(0, 0, 0);

    // Gizmo 坐标轴组：箭头 + 轴端文字精灵
    const gLen = 50;
    const gHeadLen = gLen * 0.2;
    const gHeadWidth = gLen * 0.12;
    const gizmoAxes = new THREE.Group();
    gizmoAxes.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), gLen, 0xEF4444, gHeadLen, gHeadWidth));
    gizmoAxes.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), gLen, 0x22C55E, gHeadLen, gHeadWidth));
    gizmoAxes.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), gLen, 0x3B82F6, gHeadLen, gHeadWidth));
    gizmoScene.add(gizmoAxes);

    // 轴端文字标签精灵
    const makeLabel = (text: string, color: string, position: THREE.Vector3) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(text, 32, 32);
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(18, 18, 1);
      sprite.position.copy(position);
      return sprite;
    };
    gizmoAxes.add(makeLabel('X', '#EF4444', new THREE.Vector3(gLen + 14, 0, 0)));
    gizmoAxes.add(makeLabel('Y', '#22C55E', new THREE.Vector3(0, gLen + 14, 0)));
    gizmoAxes.add(makeLabel('Z', '#3B82F6', new THREE.Vector3(0, 0, gLen + 14)));

    // 禁用自动清除，以便同一 Canvas 上绘制两次
    renderer.autoClear = false;

    // WBOIT (Order-Independent Transparency) 渲染器
    const wboitRenderer = new WBOITRenderer(renderer);

    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      meshes: [],
      axesGroup,
      gizmoScene,
      gizmoCamera,
      gizmoAxes,
      wboitRenderer,
      animationId: 0,
    };

    const animate = () => {
      if (!sceneRef.current) return;
      sceneRef.current.animationId = requestAnimationFrame(animate);
      sceneRef.current.controls.update();

      const w = container.clientWidth;
      const h = container.clientHeight;

      // 清除整个画布
      sceneRef.current.renderer.clear();

      // 1. 渲染主场景（全屏视口）— 使用 WBOIT 实现顺序无关透明度
      sceneRef.current.renderer.setViewport(0, 0, w, h);
      sceneRef.current.wboitRenderer.render(scene, camera);

      // 2. 渲染 Gizmo（左下角独立区域）
      //    关键：gizmoCamera 始终固定不动，原心永远在视口正中
      //    仅将主相机的旋转反向应用到 gizmoAxes 组，使其反映当前视角
      //    平移和缩放不会改变主相机的 quaternion，因此 gizmo 天然免疫
      sceneRef.current.renderer.setScissorTest(true);
      sceneRef.current.renderer.setViewport(0, 0, gizmoViewPx, gizmoViewPx);
      sceneRef.current.renderer.setScissor(0, 0, gizmoViewPx, gizmoViewPx);
      sceneRef.current.renderer.clearDepth();

      sceneRef.current.gizmoAxes.quaternion.copy(camera.quaternion).invert();
      sceneRef.current.renderer.render(gizmoScene, gizmoCamera);

      sceneRef.current.renderer.setScissorTest(false);
    };
    animate();

    const handleResize = () => {
      if (!sceneRef.current || !container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      if (newWidth === 0 || newHeight === 0) return;
      sceneRef.current.camera.aspect = newWidth / newHeight;
      sceneRef.current.camera.updateProjectionMatrix();
      sceneRef.current.renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId);
        sceneRef.current.wboitRenderer.dispose();
      }
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Initialize scene — 使用轮询等待容器有尺寸后再初始化
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 如果容器已有尺寸，直接初始化
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      const cleanup = setupScene(container);
      return cleanup || undefined;
    }

    // 容器尺寸为0，轮询等待
    let cleanupFn: (() => void) | null | undefined = null;
    const pollTimer = setInterval(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        clearInterval(pollTimer);
        cleanupFn = setupScene(container);
      }
    }, 50);

    return () => {
      clearInterval(pollTimer);
      if (cleanupFn) cleanupFn();
    };
  }, [setupScene]);

  // Load models only once
  useEffect(() => {
    if (!sceneRef.current || models.length === 0) return;
    if (modelsLoadedRef.current && JSON.stringify(models.map(m => m.file_path)) === JSON.stringify(initialModelsRef.current.map(m => m.file_path))) {
      // 模型已加载且文件相同，直接更新属性
      models.forEach((config, index) => {
        const meshData = sceneRef.current!.meshes[index];
        if (!meshData) return;
        const isTransparent = config.opacity < 100;
        meshData.mesh.visible = config.visible;
        meshData.visible = config.visible;
        meshData.material.opacity = isTransparent ? config.opacity / 100 : 1;
        meshData.material.transparent = isTransparent;
        meshData.material.color.set(getModelColor(config.color));
        meshData.material.needsUpdate = true;
      });
      return;
    }

    const loadModels = async () => {
      const { scene, meshes: existingMeshes } = sceneRef.current!;

      // 清理旧模型（包括可能的背面子mesh）
      existingMeshes.forEach(m => {
        // 移除子mesh（背面mesh等）
        while (m.mesh.children.length > 0) {
          const child = m.mesh.children[0];
          m.mesh.remove(child);
          if ((child as THREE.Mesh).material) {
            ((child as THREE.Mesh).material as THREE.Material).dispose();
          }
        }
        scene.remove(m.mesh);
        m.mesh.geometry.dispose();
        m.material.dispose();
      });
      sceneRef.current!.meshes = [];
      modelsLoadedRef.current = false;

      setIsLoading(true);
      setError(null);
      setTotalCount(models.length);
      setLoadedCount(0);

      const newMeshes: ModelMesh[] = [];

      for (let i = 0; i < models.length; i++) {
        const config = models[i];
        
        try {
          // 判断文件来源：s3:// 开头则通过代理API获取，否则直接使用本地路径
          const fileUrl = config.file_path.startsWith('s3://')
            ? `/api/file?key=${encodeURIComponent(config.file_path)}`
            : `/${config.file_path}`;
          let geometry: THREE.BufferGeometry;
          
          // 单次fetch获取ArrayBuffer，从缓冲区判断格式，避免重复下载
          const response = await fetch(fileUrl);
          if (!response.ok) {
            throw new Error(`文件加载失败: ${response.status} ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          
          // 检测ASCII STL：前几个字节解码后以"solid"开头
          const headerText = new TextDecoder().decode(uint8.slice(0, 80));
          if (headerText.trim().startsWith('solid')) {
            const text = new TextDecoder().decode(uint8);
            geometry = parseASCIISTL(text);
          } else {
            const loader = new STLLoader();
            geometry = loader.parse(arrayBuffer);
          }
          
          const isTransparent = config.opacity < 100;

          const material = new THREE.MeshPhongMaterial({
            color: new THREE.Color(getModelColor(config.color)),
            transparent: isTransparent,
            opacity: isTransparent ? config.opacity / 100 : 1,
            shininess: 30,
            side: THREE.DoubleSide,
          });

          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = config.name;
          mesh.visible = config.visible;

          scene.add(mesh);
          newMeshes.push({
            name: config.name,
            mesh,
            material,
            visible: config.visible,
          });
          
          setLoadedCount(i + 1);

        } catch (err) {
          console.error(`处理模型 ${config.name} 失败:`, err);
          const placeholderGeo = new THREE.BoxGeometry(30, 40, 50);
          const material = new THREE.MeshPhongMaterial({
            color: new THREE.Color(getModelColor(config.color)),
            transparent: true,
            opacity: 0.5,
            shininess: 30,
            side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(placeholderGeo, material);
          mesh.name = config.name;
          mesh.visible = config.visible;
          scene.add(mesh);
          newMeshes.push({
            name: config.name,
            mesh,
            material,
            visible: config.visible,
          });
        }
      }

      sceneRef.current!.meshes = newMeshes;
      modelsLoadedRef.current = true;
      initialModelsRef.current = JSON.parse(JSON.stringify(models));

      // 计算每个模型体积并回调
      if (onVolumesLoaded) {
        const volumes = newMeshes.map(m => calculateVolume(m.mesh.geometry));
        onVolumesLoaded(volumes);
      }

      // 居中所有模型并调整相机位置（带防抖）
      const centerAndFitCamera = () => {
        if (!sceneRef.current || newMeshes.length === 0) return;

        // 1. 计算所有模型的合并包围盒
        const box = new THREE.Box3();
        newMeshes.forEach(m => box.expandByObject(m.mesh));
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        if (maxDim === 0) return;

        // 2. 缩放到合理尺寸并平移到原点
        const targetSize = 100;
        const scale = targetSize / maxDim;
        newMeshes.forEach(m => {
          m.mesh.position.sub(center);
          m.mesh.scale.setScalar(scale);
        });

        // 3. 重新计算缩放后的包围盒，获取真实几何中心
        const scaledBox = new THREE.Box3();
        newMeshes.forEach(m => scaledBox.expandByObject(m.mesh));
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledMaxDim = Math.max(scaledSize.x, scaledSize.y, scaledSize.z);

        // 4. 基于相机 FOV 精确计算距离，确保模型完整出现在视口内
        const camera = sceneRef.current!.camera;
        const fovRad = (camera.fov * Math.PI) / 180;
        const aspect = camera.aspect;
        // 垂直方向所需距离
        const distV = scaledMaxDim / (2 * Math.tan(fovRad / 2));
        // 水平方向所需距离
        const distH = scaledMaxDim / (2 * Math.tan(fovRad / 2) * aspect);
        const fitDistance = Math.max(distV, distH) * 1.5; // 1.5 留边距

        // 5. 设置相机位置：方位角45°，仰角30°
        const azimuth = Math.PI / 4;
        const elevation = Math.PI / 6;

        camera.position.set(
          scaledCenter.x + fitDistance * Math.cos(elevation) * Math.sin(azimuth),
          scaledCenter.y + fitDistance * Math.sin(elevation),
          scaledCenter.z + fitDistance * Math.cos(elevation) * Math.cos(azimuth)
        );
        camera.lookAt(scaledCenter);
        camera.updateProjectionMatrix();

        // 6. 将 OrbitControls 的 target 设为几何中心
        sceneRef.current!.controls.target.copy(scaledCenter);
        sceneRef.current!.controls.update();

        // 7. 保存当前状态为初始状态，供「复位」按钮使用
        savedCameraState.current = {
          position: camera.position.clone(),
          up: camera.up.clone(),
          target: sceneRef.current!.controls.target.clone(),
        };
      };

      // 防抖：100ms 后执行一次，避免模型加载过程中频繁刷新
      if (centerDebounceRef.current) {
        clearTimeout(centerDebounceRef.current);
      }
      centerDebounceRef.current = setTimeout(centerAndFitCamera, 100);

      setIsLoading(false);
    };

    loadModels();
  }, [models.length]);

  // 复位：恢复到模型加载完成时的最佳视角
  const handleReset = useCallback(() => {
    if (!sceneRef.current || !savedCameraState.current) return;
    const { position, up, target } = savedCameraState.current;
    sceneRef.current.camera.position.copy(position);
    sceneRef.current.camera.up.copy(up);
    sceneRef.current.controls.target.copy(target);
    sceneRef.current.camera.lookAt(target);
    sceneRef.current.camera.updateProjectionMatrix();
  }, []);

  // 背景切换：黑 → 灰 → 白 循环
  const handleToggleBackground = useCallback(() => {
    if (!sceneRef.current) return;
    const bgColors = bgColorsRef.current;
    setBgColorIndex(prev => {
      const next = (prev + 1) % bgColors.length;
      sceneRef.current!.scene.background = new THREE.Color(bgColors[next]);
      return next;
    });
  }, []);

  // 坐标轴切换
  const handleToggleAxes = useCallback(() => {
    if (!sceneRef.current) return;
    const axes = sceneRef.current.axesGroup;
    axes.visible = !axes.visible;
    setAxesVisible(axes.visible);
  }, []);

  // 直接更新mesh属性函数
  const updateMeshProperties = useCallback(() => {
    if (!sceneRef.current || sceneRef.current.meshes.length === 0) return;
    // WBOIT handles transparency automatically — just update material properties
    sceneRef.current.meshes.forEach((meshData, index) => {
      const config = models[index];
      if (!config) return;
      const isTransparent = config.opacity < 100;
      meshData.mesh.visible = config.visible;
      meshData.visible = config.visible;
      meshData.material.opacity = isTransparent ? config.opacity / 100 : 1;
      meshData.material.transparent = isTransparent;
      meshData.material.color.set(getModelColor(config.color));
      meshData.material.needsUpdate = true;
    });
  }, [models]);

  // 监听visibility和opacity变化
  useEffect(() => {
    if (!modelsLoadedRef.current) return;
    updateMeshProperties();
  }, [JSON.stringify(models.map(m => `${m.name}-${m.visible}-${m.opacity}`))]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      
      {/* 右上角控制按钮 */}
      <div
        className="absolute top-3 right-3 z-10 flex flex-col gap-2"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 按钮1：复位视角 */}
        <button
          onClick={handleReset}
          className="group flex flex-col items-center gap-1 w-[72px] py-2.5 rounded-xl bg-white border border-gray-200/80 shadow-[0_2px_6px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] hover:border-gray-300 active:scale-95 transition-all duration-200"
          title="复位视角"
        >
          <img src="/icon-reset.png" alt="复位视角" className="w-6 h-6 object-contain" draggable={false} />
          <span className="text-[10px] font-semibold text-slate-700 leading-tight">复位视角</span>
        </button>

        {/* 按钮2：切换背景 */}
        <button
          onClick={handleToggleBackground}
          className="group flex flex-col items-center gap-1 w-[72px] py-2.5 rounded-xl bg-white border border-gray-200/80 shadow-[0_2px_6px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] hover:border-gray-300 active:scale-95 transition-all duration-200"
          title={`切换背景（当前：${bgLabelsRef.current[bgColorIndex]}）`}
        >
          <img src="/icon-bg.png" alt="切换背景" className="w-6 h-6 object-contain" draggable={false} />
          <span className="text-[10px] font-semibold text-slate-700 leading-tight">切换背景</span>
        </button>

        {/* 按钮3：显示坐标 */}
        <button
          onClick={handleToggleAxes}
          className={`group flex flex-col items-center gap-1 w-[72px] py-2.5 rounded-xl border shadow-[0_2px_6px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] active:scale-95 transition-all duration-200 ${
            axesVisible
              ? 'bg-gray-100 border-gray-300/80'
              : 'bg-white border-gray-200/80 hover:border-gray-300'
          }`}
          title={axesVisible ? '隐藏坐标' : '显示坐标'}
        >
          <img src="/icon-axes.png" alt="显示坐标" className="w-6 h-6 object-contain" draggable={false} />
          <span className="text-[10px] font-semibold text-slate-700 leading-tight">显示坐标</span>
        </button>
      </div>
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-gray-600">
              加载3D模型中... ({loadedCount}/{totalCount})
            </p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute bottom-4 left-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      
      <div className="absolute bottom-4 right-4 bg-white/90 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500">
        <div className="hidden md:block">
          <p className="font-medium text-gray-700 mb-0.5">电脑端操作</p>
          <p>鼠标左键：旋转模型</p>
          <p>鼠标右键：平移模型</p>
          <p>滚轮：放大缩小</p>
        </div>
        <div className="md:hidden">
          <p className="font-medium text-gray-700 mb-0.5">移动端操作</p>
          <p>单指滑动：旋转模型</p>
          <p>双指滑动：平移模型</p>
          <p>双指捏合：放大缩小</p>
        </div>
      </div>
    </div>
  );
}
