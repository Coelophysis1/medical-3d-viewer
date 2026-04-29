'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { getModelColor, ModelConfig, COLOR_MAP } from '@/types/medical';
import { WBOITRenderer } from '@/lib/wboit';

interface ModelMesh {
  name: string;
  mesh: THREE.Mesh;
  material: THREE.MeshPhysicalMaterial;
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

/**
 * 根据组织类型生成 MeshPhysicalMaterial 参数
 * 不同组织有不同的 Fake SSS (次表面散射) 特征
 */
function getTissueMaterialParams(colorKey: string): {
  metalness: number;
  roughness: number;
  transmission: number;
  thickness: number;
  ior: number;
  clearcoat: number;
  clearcoatRoughness: number;
} {
  // 根据颜色键（组织类型）返回物理参数
  const tissueParams: Record<string, ReturnType<typeof getTissueMaterialParams>> = {
    // 软组织类：较高透射，模拟光线穿透
    tissue:             { metalness: 0.0, roughness: 0.45, transmission: 0.15, thickness: 1.0, ior: 1.33, clearcoat: 0.1, clearcoatRoughness: 0.3 },
    organ:              { metalness: 0.0, roughness: 0.40, transmission: 0.20, thickness: 1.5, ior: 1.35, clearcoat: 0.15, clearcoatRoughness: 0.25 },
    muscle:             { metalness: 0.0, roughness: 0.50, transmission: 0.10, thickness: 1.2, ior: 1.33, clearcoat: 0.05, clearcoatRoughness: 0.4 },
    skin:               { metalness: 0.0, roughness: 0.55, transmission: 0.08, thickness: 0.8, ior: 1.33, clearcoat: 0.3,  clearcoatRoughness: 0.2 },
    connective_tissue:  { metalness: 0.0, roughness: 0.40, transmission: 0.12, thickness: 0.6, ior: 1.35, clearcoat: 0.1,  clearcoatRoughness: 0.3 },
    // 骨骼/牙齿类：低透射，较高粗糙度
    bone:               { metalness: 0.0, roughness: 0.55, transmission: 0.02, thickness: 2.0, ior: 1.55, clearcoat: 0.05, clearcoatRoughness: 0.5 },
    teeth:              { metalness: 0.0, roughness: 0.30, transmission: 0.03, thickness: 2.0, ior: 1.62, clearcoat: 0.4,  clearcoatRoughness: 0.15 },
    cartilage:          { metalness: 0.0, roughness: 0.35, transmission: 0.08, thickness: 0.8, ior: 1.35, clearcoat: 0.2,  clearcoatRoughness: 0.25 },
    // 血管类：较高透射模拟血液透光
    blood:              { metalness: 0.0, roughness: 0.35, transmission: 0.18, thickness: 0.5, ior: 1.33, clearcoat: 0.2,  clearcoatRoughness: 0.2 },
    artery:             { metalness: 0.0, roughness: 0.35, transmission: 0.18, thickness: 0.5, ior: 1.33, clearcoat: 0.2,  clearcoatRoughness: 0.2 },
    vein:               { metalness: 0.0, roughness: 0.35, transmission: 0.20, thickness: 0.4, ior: 1.33, clearcoat: 0.2,  clearcoatRoughness: 0.2 },
    // 神经系统：中等透射
    nerve:              { metalness: 0.0, roughness: 0.40, transmission: 0.10, thickness: 0.5, ior: 1.40, clearcoat: 0.1,  clearcoatRoughness: 0.3 },
    gray_matter:        { metalness: 0.0, roughness: 0.50, transmission: 0.10, thickness: 1.5, ior: 1.35, clearcoat: 0.05, clearcoatRoughness: 0.4 },
    white_matter:       { metalness: 0.0, roughness: 0.45, transmission: 0.08, thickness: 1.5, ior: 1.35, clearcoat: 0.05, clearcoatRoughness: 0.4 },
    // 韧带/肌腱：偏低透射
    ligament:           { metalness: 0.0, roughness: 0.40, transmission: 0.06, thickness: 0.6, ior: 1.40, clearcoat: 0.15, clearcoatRoughness: 0.3 },
    tendon:             { metalness: 0.0, roughness: 0.38, transmission: 0.06, thickness: 0.5, ior: 1.40, clearcoat: 0.15, clearcoatRoughness: 0.3 },
    // 脂肪：较高透射，模拟半透明脂肪
    fat:                { metalness: 0.0, roughness: 0.45, transmission: 0.25, thickness: 1.0, ior: 1.44, clearcoat: 0.1,  clearcoatRoughness: 0.3 },
    // 淋巴系统：中等透射
    lymph_node:         { metalness: 0.0, roughness: 0.45, transmission: 0.10, thickness: 0.8, ior: 1.35, clearcoat: 0.1,  clearcoatRoughness: 0.3 },
    lymphatic_vessel:   { metalness: 0.0, roughness: 0.40, transmission: 0.12, thickness: 0.3, ior: 1.35, clearcoat: 0.1,  clearcoatRoughness: 0.3 },
    // 体液类：高透射
    cerebrospinal_fluid:{ metalness: 0.0, roughness: 0.10, transmission: 0.50, thickness: 0.5, ior: 1.33, clearcoat: 0.3,  clearcoatRoughness: 0.1 },
    bile:               { metalness: 0.0, roughness: 0.15, transmission: 0.40, thickness: 0.5, ior: 1.33, clearcoat: 0.3,  clearcoatRoughness: 0.1 },
    fluid:              { metalness: 0.0, roughness: 0.10, transmission: 0.45, thickness: 0.5, ior: 1.33, clearcoat: 0.3,  clearcoatRoughness: 0.1 },
    // 病变类
    mass:               { metalness: 0.0, roughness: 0.50, transmission: 0.12, thickness: 1.2, ior: 1.35, clearcoat: 0.1,  clearcoatRoughness: 0.3 },
    edema:              { metalness: 0.0, roughness: 0.25, transmission: 0.30, thickness: 0.8, ior: 1.33, clearcoat: 0.2,  clearcoatRoughness: 0.2 },
    bleeding:           { metalness: 0.0, roughness: 0.40, transmission: 0.15, thickness: 0.6, ior: 1.33, clearcoat: 0.15, clearcoatRoughness: 0.25 },
    necrosis:           { metalness: 0.0, roughness: 0.60, transmission: 0.05, thickness: 1.0, ior: 1.35, clearcoat: 0.0,  clearcoatRoughness: 0.5 },
    // 异物/植入物：金属或塑料质感
    foreign_object:     { metalness: 0.3, roughness: 0.20, transmission: 0.0,  thickness: 0.0, ior: 1.50, clearcoat: 0.5,  clearcoatRoughness: 0.1 },
    // 靶区：明亮高亮，低透射
    target_volume:      { metalness: 0.0, roughness: 0.30, transmission: 0.08, thickness: 1.0, ior: 1.33, clearcoat: 0.2,  clearcoatRoughness: 0.2 },
    // 支气管/气道：管状中空结构，中等透射
    airway:             { metalness: 0.0, roughness: 0.35, transmission: 0.15, thickness: 0.4, ior: 1.33, clearcoat: 0.25, clearcoatRoughness: 0.2 },
  };

  return tissueParams[colorKey] || tissueParams['tissue'];
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
    composer: EffectComposer;
    ssaoPass: SSAOPass;
    animationId: number;
    // 渲染模式切换所需的引用
    envTexture: THREE.Texture;
    keyLight: THREE.DirectionalLight;
    fillLight: THREE.DirectionalLight;
    rimLight: THREE.DirectionalLight;
    ambientLight: THREE.AmbientLight;
    renderPass: RenderPass;
    outputPass: OutputPass;
    smaaPass: SMAAPass;
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
  const [renderMode, setRenderMode] = useState<'cinematic' | 'classic'>('classic');
  const [bgColorIndex, setBgColorIndex] = useState(2); // 0:黑 1:灰 2:白(默认)
  // 使用 useRef 避免每次渲染创建新数组
  const bgColorsRef = useRef(['#000000', '#808080', '#ffffff']);
  const bgLabelsRef = useRef(['黑', '灰', '白']);

  // 创建场景的核心逻辑
  const setupScene = useCallback((container: HTMLDivElement) => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
    camera.position.set(200, 200, 200);
    camera.lookAt(0, 0, 0);

    // ──────────────────────────────────────────────
    //  1. 渲染器（默认经典模式，切换时动态调整）
    // ──────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);

    // 经典模式：无色调映射，曝光稍高
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.2;

    container.appendChild(renderer.domElement);

    // ──────────────────────────────────────────────
    //  2. IBL 环境光（预生成，切换时按需启用/禁用）
    // ──────────────────────────────────────────────
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    // 经典模式不使用 IBL
    // scene.environment = envTexture;
    pmremGenerator.dispose();

    // 经典模式灯光：较强环境光 + 双方向光
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    // 灯光：挂载到相机，使光源始终跟随视角（左上方为主光方向）
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(-60, 80, 60); // 左上方

    const fillLight = new THREE.DirectionalLight(0xc8d8e8, 1.0);
    fillLight.position.set(40, 20, -60); // 右下方补光

    const rimLight = new THREE.DirectionalLight(0xe8f0ff, 0.4);
    rimLight.position.set(0, -40, -80); // 背面轮廓光

    // 经典模式：灯光跟随相机；电影模式：灯光固定在场景
    camera.add(keyLight);
    camera.add(fillLight);
    camera.add(rimLight);
    scene.add(camera); // 相机加入场景，使子对象（灯光）渲染生效

    // ──────────────────────────────────────────────
    //  3. 后期处理管线：SSAO + OutputPass
    // ──────────────────────────────────────────────
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // SSAO 环境光遮蔽：加深沟壑阴影，增强立体感（经典模式默认禁用）
    const ssaoPass = new SSAOPass(scene, camera, width, height);
    ssaoPass.kernelRadius = 16;
    ssaoPass.minDistance = 0.001;
    ssaoPass.maxDistance = 0.1;
    ssaoPass.output = SSAOPass.OUTPUT.Default;
    ssaoPass.enabled = false;
    composer.addPass(ssaoPass);

    // OutputPass：色调映射 + 颜色空间转换（替代手动 OutputPass）
    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    // SMAA 抗锯齿：EffectComposer 的渲染目标不继承 WebGLRenderer 的 antialias，
    // 必须添加 SMAA 来消除锯齿（经典模式使用 renderer.render 直出，禁用 SMAA）
    const smaaPass = new SMAAPass();
    smaaPass.enabled = false;
    composer.addPass(smaaPass);

    // ──────────────────────────────────────────────
    //  4. 控制器
    // ──────────────────────────────────────────────
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 2.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = false;
    controls.dynamicDampingFactor = 0.15;

    // ──────────────────────────────────────────────
    //  5. 坐标轴 + Orientation Gizmo
    // ──────────────────────────────────────────────
    const axesGroup = new THREE.Group();
    const axisLen = 40;
    const headLen = axisLen * 0.15;
    const headWidth = axisLen * 0.08;
    axesGroup.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), axisLen, 0xEF4444, headLen, headWidth));
    axesGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), axisLen, 0x22C55E, headLen, headWidth));
    axesGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), axisLen, 0x3B82F6, headLen, headWidth));
    axesGroup.visible = false;
    scene.add(axesGroup);

    const gizmoViewPx = 130;
    const gizmoFrustum = 80;
    const gizmoScene = new THREE.Scene();

    const gizmoCamera = new THREE.OrthographicCamera(
      -gizmoFrustum, gizmoFrustum,
      gizmoFrustum, -gizmoFrustum,
      0.1, 1000
    );
    gizmoCamera.position.set(0, 0, 300);
    gizmoCamera.lookAt(0, 0, 0);

    const gLen = 50;
    const gHeadLen = gLen * 0.2;
    const gHeadWidth = gLen * 0.12;
    const gizmoAxes = new THREE.Group();
    gizmoAxes.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), gLen, 0xEF4444, gHeadLen, gHeadWidth));
    gizmoAxes.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), gLen, 0x22C55E, gHeadLen, gHeadWidth));
    gizmoAxes.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), gLen, 0x3B82F6, gHeadLen, gHeadWidth));
    gizmoScene.add(gizmoAxes);

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

    // 禁用自动清除
    renderer.autoClear = false;

    // ──────────────────────────────────────────────
    //  6. WBOIT 渲染器（传入 composer 用于不透明通道后期处理）
    // ──────────────────────────────────────────────
    const wboitRenderer = new WBOITRenderer(renderer, composer);
    // 经典模式默认禁用 composer（使用 renderer.render 直出，保留 MSAA 抗锯齿）
    wboitRenderer.setComposerEnabled(false);

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
      composer,
      ssaoPass,
      animationId: 0,
      envTexture,
      keyLight,
      fillLight,
      rimLight,
      ambientLight,
      renderPass,
      outputPass,
      smaaPass,
    };

    const animate = () => {
      if (!sceneRef.current) return;
      sceneRef.current.animationId = requestAnimationFrame(animate);
      sceneRef.current.controls.update();

      const w = container.clientWidth;
      const h = container.clientHeight;

      // 清除整个画布
      sceneRef.current.renderer.clear();

      // 1. 渲染主场景 — WBOIT 内部使用 composer 处理不透明通道的 SSAO
      sceneRef.current.renderer.setViewport(0, 0, w, h);
      sceneRef.current.wboitRenderer.render(scene, camera);

      // 2. 渲染 Gizmo（左下角独立区域）
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
      sceneRef.current.composer.setSize(newWidth, newHeight);
      // SSAOPass 需要更新分辨率
      sceneRef.current.ssaoPass.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId);
        sceneRef.current.wboitRenderer.dispose();
      }
      composer.dispose();
      renderer.dispose();
      envTexture.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Initialize scene — 使用轮询等待容器有尺寸后再初始化
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (container.clientWidth > 0 && container.clientHeight > 0) {
      const cleanup = setupScene(container);
      return cleanup || undefined;
    }

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

      // 清理旧模型
      existingMeshes.forEach(m => {
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
          const fileUrl = config.file_path.startsWith('s3://')
            ? `/api/file?key=${encodeURIComponent(config.file_path)}`
            : `/${config.file_path}`;
          let geometry: THREE.BufferGeometry;
          
          const response = await fetch(fileUrl);
          if (!response.ok) {
            throw new Error(`文件加载失败: ${response.status} ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          
          const headerText = new TextDecoder().decode(uint8.slice(0, 80));
          if (headerText.trim().startsWith('solid')) {
            const text = new TextDecoder().decode(uint8);
            geometry = parseASCIISTL(text);
          } else {
            const loader = new STLLoader();
            geometry = loader.parse(arrayBuffer);
          }
          
          const isTransparent = config.opacity < 100;
          const colorValue = getModelColor(config.color);
          const tissueParams = getTissueMaterialParams(config.color);

          // ──────────────────────────────────────────────
          //  MeshPhysicalMaterial（默认经典模式参数）
          // ──────────────────────────────────────────────
          const material = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(colorValue),
            transparent: isTransparent,
            opacity: isTransparent ? config.opacity / 100 : 1,
            side: THREE.DoubleSide,

            // 经典模式参数（Lambert 风格）
            metalness: 0,
            roughness: 0.8,

            // Fake SSS 参数（电影级切换时启用）
            transmission: 0,
            thickness: 0,
            ior: 1.5,

            clearcoat: 0,
            clearcoatRoughness: 0.2,

            // 经典模式不使用环境贴图
            envMapIntensity: 0,
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
          const tissueParams = getTissueMaterialParams(config.color);
          const material = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(getModelColor(config.color)),
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            metalness: 0,
            roughness: 0.8,
            transmission: 0,
            thickness: 0,
            ior: 1.5,
            clearcoat: 0,
            clearcoatRoughness: 0.2,
            envMapIntensity: 0,
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

        const box = new THREE.Box3();
        newMeshes.forEach(m => box.expandByObject(m.mesh));
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        if (maxDim === 0) return;

        const targetSize = 100;
        const scale = targetSize / maxDim;
        newMeshes.forEach(m => {
          m.mesh.position.sub(center);
          m.mesh.scale.setScalar(scale);
        });

        const scaledBox = new THREE.Box3();
        newMeshes.forEach(m => scaledBox.expandByObject(m.mesh));
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledMaxDim = Math.max(scaledSize.x, scaledSize.y, scaledSize.z);

        const camera = sceneRef.current!.camera;
        const fovRad = (camera.fov * Math.PI) / 180;
        const aspect = camera.aspect;
        const distV = scaledMaxDim / (2 * Math.tan(fovRad / 2));
        const distH = scaledMaxDim / (2 * Math.tan(fovRad / 2) * aspect);
        const fitDistance = Math.max(distV, distH) * 1.5;

        const azimuth = Math.PI / 4;
        const elevation = Math.PI / 6;

        camera.position.set(
          scaledCenter.x + fitDistance * Math.cos(elevation) * Math.sin(azimuth),
          scaledCenter.y + fitDistance * Math.sin(elevation),
          scaledCenter.z + fitDistance * Math.cos(elevation) * Math.cos(azimuth)
        );
        camera.lookAt(scaledCenter);
        camera.updateProjectionMatrix();

        sceneRef.current!.controls.target.copy(scaledCenter);
        sceneRef.current!.controls.update();

        savedCameraState.current = {
          position: camera.position.clone(),
          up: camera.up.clone(),
          target: sceneRef.current!.controls.target.clone(),
        };
      };

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

  // 背景切换
  const handleToggleBackground = useCallback(() => {
    if (!sceneRef.current) return;
    const bgColors = bgColorsRef.current;
    setBgColorIndex(prev => {
      const next = (prev + 1) % bgColors.length;
      sceneRef.current!.scene.background = new THREE.Color(bgColors[next]);
      return next;
    });
  }, []);

  // 渲染模式切换
  const handleToggleRenderMode = useCallback(() => {
    if (!sceneRef.current) return;
    const s = sceneRef.current;
    const nextMode = renderMode === 'cinematic' ? 'classic' : 'cinematic';
    setRenderMode(nextMode);

    if (nextMode === 'classic') {
      // 经典模式：关闭色调映射，移除 IBL，灯光跟随相机，禁用 SSAO，绕过 composer
      s.renderer.toneMapping = THREE.NoToneMapping;
      s.renderer.toneMappingExposure = 1.2;
      s.scene.environment = null;
      // 灯光挂载到相机，跟随视角旋转
      s.camera.add(s.keyLight);
      s.camera.add(s.fillLight);
      s.camera.add(s.rimLight);
      s.keyLight.position.set(-60, 80, 60);
      s.fillLight.position.set(40, 20, -60);
      s.rimLight.position.set(0, -40, -80);
      s.keyLight.intensity = 2.0;
      s.fillLight.intensity = 1.0;
      s.rimLight.intensity = 0.4;
      s.ambientLight.intensity = 1.2;
      s.ssaoPass.enabled = false;
      s.smaaPass.enabled = false;
      s.wboitRenderer.setComposerEnabled(false);

      // 切换材质为经典 Lambert 风格
      s.meshes.forEach((meshData) => {
        meshData.material.transmission = 0;
        meshData.material.thickness = 0;
        meshData.material.clearcoat = 0;
        meshData.material.ior = 1.5;
        meshData.material.metalness = 0;
        meshData.material.roughness = 0.8;
        meshData.material.envMapIntensity = 0;
        meshData.material.needsUpdate = true;
      });
    } else {
      // 电影级模式：恢复所有高级渲染设置，灯光同样跟随相机，启用 composer
      s.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      s.renderer.toneMappingExposure = 1.0;
      s.scene.environment = s.envTexture;
      // 灯光保持挂载在相机上，跟随视角旋转
      // 电影模式 IBL 提供基础照明，辅助光更柔和
      s.keyLight.position.set(-40, 60, 40);
      s.fillLight.position.set(30, 10, -50);
      s.rimLight.position.set(0, -30, -60);
      s.keyLight.intensity = 2.5;
      s.fillLight.intensity = 0.8;
      s.rimLight.intensity = 0.5;
      s.ambientLight.intensity = 0.1;
      s.ssaoPass.enabled = true;
      s.smaaPass.enabled = true;
      s.wboitRenderer.setComposerEnabled(true);

      // 恢复材质为电影级物理材质
      s.meshes.forEach((meshData) => {
        const colorKey = meshData.name;
        // 从模型配置中找对应的 color key
        const config = models.find(m => m.name === colorKey);
        const tissueParams = getTissueMaterialParams(config?.color || 'tissue');
        const isTransparent = meshData.material.transparent;

        meshData.material.transmission = isTransparent ? tissueParams.transmission * 0.5 : tissueParams.transmission;
        meshData.material.thickness = tissueParams.thickness;
        meshData.material.clearcoat = tissueParams.clearcoat;
        meshData.material.clearcoatRoughness = tissueParams.clearcoatRoughness;
        meshData.material.ior = tissueParams.ior;
        meshData.material.metalness = tissueParams.metalness;
        meshData.material.roughness = tissueParams.roughness;
        meshData.material.envMapIntensity = 0.3;
        meshData.material.needsUpdate = true;
      });
    }
  }, [renderMode, models]);

  // 直接更新mesh属性函数
  const updateMeshProperties = useCallback(() => {
    if (!sceneRef.current || sceneRef.current.meshes.length === 0) return;
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
        <button
          onClick={handleReset}
          className="group flex flex-col items-center gap-1 w-[72px] py-2.5 rounded-xl bg-white border border-gray-200/80 shadow-[0_2px_6px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] hover:border-gray-300 active:scale-95 transition-all duration-200"
          title="复位视角"
        >
          <img src="/icon-reset.png" alt="复位视角" className="w-6 h-6 object-contain" draggable={false} />
          <span className="text-[10px] font-semibold text-slate-700 leading-tight">复位视角</span>
        </button>

        <button
          onClick={handleToggleBackground}
          className="group flex flex-col items-center gap-1 w-[72px] py-2.5 rounded-xl bg-white border border-gray-200/80 shadow-[0_2px_6px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] hover:border-gray-300 active:scale-95 transition-all duration-200"
          title={`切换背景（当前：${bgLabelsRef.current[bgColorIndex]}）`}
        >
          <img src="/icon-bg.png" alt="切换背景" className="w-6 h-6 object-contain" draggable={false} />
          <span className="text-[10px] font-semibold text-slate-700 leading-tight">切换背景</span>
        </button>

        <button
          onClick={handleToggleRenderMode}
          className={`group flex flex-col items-center gap-1 w-[72px] py-2.5 rounded-xl border shadow-[0_2px_6px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] active:scale-95 transition-all duration-200 ${
            renderMode === 'cinematic'
              ? 'bg-gradient-to-b from-gray-50 to-gray-100 border-gray-300/80'
              : 'bg-white border-gray-200/80 hover:border-gray-300'
          }`}
          title={renderMode === 'cinematic' ? '切换为经典渲染' : '切换为电影级渲染'}
        >
          <img
            src={renderMode === 'cinematic' ? '/icon-cinematic.png' : '/icon-classic.png'}
            alt={renderMode === 'cinematic' ? '电影级' : '经典'}
            className="w-6 h-6 object-contain"
            draggable={false}
          />
          <span className="text-[10px] font-semibold text-slate-700 leading-tight">
            {renderMode === 'cinematic' ? '电影级' : '经典'}
          </span>
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
