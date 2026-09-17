import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export interface Measurement {
  id: string;
  point1: THREE.Vector3;
  point2: THREE.Vector3;
  distance: number; // cm
  solidLine: THREE.Line;    // 实线 (depthTest:true，可见部分)
  dashedLine: THREE.Line;   // 虚线 (depthTest:false，被遮挡部分，更淡更密)
  marker1: THREE.Mesh;
  marker2: THREE.Mesh;
  lineLabel: CSS2DObject;   // 长度标签
}

export class MeasurementManager {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private meshes: THREE.Mesh[];
  private measurements: Measurement[] = [];
  private measureGroup: THREE.Group;
  private css2dRenderer: CSS2DRenderer;
  private css2dContainer: HTMLElement;

  // 当前正在测量的临时状态
  private firstPoint: THREE.Vector3 | null = null;
  private tempMarker: THREE.Mesh | null = null;
  private tempSolidLine: THREE.Line | null = null;
  private tempDashedLine: THREE.Line | null = null;
  private tempLineLabel: CSS2DObject | null = null;

  private isActive = false;
  private idCounter = 0;
  private scale = 1; // 模型缩放比例，用于距离换算
  private onChangeCallback: ((measurements: { id: string; distance: number }[]) => void) | null = null;

  constructor(scene: THREE.Scene, camera: THREE.Camera, onChange?: (measurements: { id: string; distance: number }[]) => void) {
    this.scene = scene;
    this.camera = camera;
    this.meshes = [];
    this.onChangeCallback = onChange || null;

    this.measureGroup = new THREE.Group();
    this.measureGroup.name = '__measurements__';
    this.scene.add(this.measureGroup);

    // CSS2DRenderer
    this.css2dContainer = document.createElement('div');
    this.css2dContainer.style.position = 'absolute';
    this.css2dContainer.style.top = '0';
    this.css2dContainer.style.left = '0';
    this.css2dContainer.style.pointerEvents = 'none';

    this.css2dRenderer = new CSS2DRenderer();
    this.css2dRenderer.domElement.style.position = 'absolute';
    this.css2dRenderer.domElement.style.top = '0';
    this.css2dRenderer.domElement.style.left = '0';
    this.css2dRenderer.domElement.style.pointerEvents = 'none';
    this.css2dContainer.appendChild(this.css2dRenderer.domElement);
  }

  setActive(active: boolean) {
    this.isActive = active;
    if (!active) {
      this.cancelPending();
    }
    this.notifyChange();
  }

  setMeshes(meshes: THREE.Mesh[]) {
    this.meshes = meshes;
  }

  setScale(scale: number) {
    this.scale = scale;
  }

  setContainer(container: HTMLElement) {
    if (this.css2dContainer.parentElement) {
      this.css2dContainer.parentElement.removeChild(this.css2dContainer);
    }
    container.appendChild(this.css2dContainer);
    if (this.css2dRenderer) {
      this.css2dRenderer.setSize(container.clientWidth, container.clientHeight);
    }
  }

  getIsActive() {
    return this.isActive;
  }

  hasPending(): boolean {
    return this.firstPoint !== null;
  }

  getMeasurements(): Measurement[] {
    return this.measurements;
  }

  private notifyChange() {
    if (this.onChangeCallback) {
      this.onChangeCallback(this.measurements.map(m => ({ id: m.id, distance: m.distance })));
    }
  }

  setSize(width: number, height: number) {
    this.css2dRenderer.setSize(width, height);
  }

  render() {
    this.css2dRenderer.render(this.scene, this.camera);
  }

  /**
   * 对所有测量子对象施加与模型相同的旋转变换（逐个旋转，不旋转 Group 整体）
   * @param rotQuat 旋转四元数
   * @param center 旋转中心点
   */
  applyRotation(rotQuat: THREE.Quaternion, center: THREE.Vector3) {
    const children = this.measureGroup.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      // 位置绕 center 旋转
      child.position.sub(center);
      child.position.applyQuaternion(rotQuat);
      child.position.add(center);
      // 朝向旋转
      child.quaternion.premultiply(rotQuat);
    }
    // 同步更新存储的世界坐标
    for (const m of this.measurements) {
      m.point1.sub(center).applyQuaternion(rotQuat).add(center);
      m.point2.sub(center).applyQuaternion(rotQuat).add(center);
    }
    // 同步更新待定起点
    if (this.firstPoint) {
      this.firstPoint.sub(center).applyQuaternion(rotQuat).add(center);
    }
  }

  private raycast(event: { clientX: number; clientY: number }, canvas: HTMLCanvasElement): THREE.Vector3 | null {
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);

    const visibleMeshes = this.meshes.filter(m => m.visible);
    const intersects = raycaster.intersectObjects(visibleMeshes, false);

    if (intersects.length > 0) {
      return intersects[0].point.clone();
    }
    return null;
  }

  handleClick(event: { clientX: number; clientY: number }, canvas: HTMLCanvasElement): boolean {
    if (!this.isActive) return false;

    const point = this.raycast(event, canvas);
    if (!point) return false;

    if (!this.firstPoint) {
      // 第一次点击：放置起点
      this.firstPoint = point;

      this.tempMarker = this.createMarker(point);
      this.measureGroup.add(this.tempMarker);

      return true;
    } else {
      // 第二次点击：放置终点，完成测量
      const distance = this.firstPoint.distanceTo(point) / this.scale / 10; // 世界坐标→STL mm→cm
      const lineNum = ++this.idCounter;
      const id = `m_${lineNum}`;

      const marker1 = this.tempMarker!;
      const marker2 = this.createMarker(point);
      this.measureGroup.add(marker2);

      // 移除临时预览线
      this.removeTempLines();
      // 移除临时标签
      this.removeTempLineLabel();

      // 创建正式测量线：虚线(更淡更密,始终可见) + 实线(仅可见部分)
      const dashedLine = this.createDashedLine(this.firstPoint, point);
      this.measureGroup.add(dashedLine);

      const solidLine = this.createSolidLine(this.firstPoint, point);
      this.measureGroup.add(solidLine);

      // 线段标签：在线段中点显示长度
      const midPoint = new THREE.Vector3().addVectors(this.firstPoint, point).multiplyScalar(0.5);
      const lineLabel = this.createLineLabel(`${distance.toFixed(2)}`, midPoint);
      this.measureGroup.add(lineLabel);

      const measurement: Measurement = {
        id,
        point1: this.firstPoint.clone(),
        point2: point.clone(),
        distance,
        solidLine,
        dashedLine,
        marker1,
        marker2,
        lineLabel,
      };

      this.measurements.push(measurement);

      // 重置临时状态
      this.firstPoint = null;
      this.tempMarker = null;
      this.notifyChange();

      return true;
    }
  }

  handleMouseMove(event: { clientX: number; clientY: number }, canvas: HTMLCanvasElement) {
    if (!this.isActive || !this.firstPoint) return;

    const point = this.raycast(event, canvas);
    if (!point) return;

    // 更新临时预览线
    this.removeTempLines();

    this.tempDashedLine = this.createDashedLine(this.firstPoint, point);
    this.measureGroup.add(this.tempDashedLine);

    this.tempSolidLine = this.createSolidLine(this.firstPoint, point);
    this.measureGroup.add(this.tempSolidLine);

    // 临时标签
    this.removeTempLineLabel();
    const distance = this.firstPoint.distanceTo(point) / this.scale / 10;
    const midPoint = new THREE.Vector3().addVectors(this.firstPoint, point).multiplyScalar(0.5);
    this.tempLineLabel = this.createLineLabel(`${distance.toFixed(2)}`, midPoint, true);
    this.measureGroup.add(this.tempLineLabel);
  }

  cancelPending() {
    if (this.tempMarker) {
      this.measureGroup.remove(this.tempMarker);
      this.tempMarker.geometry.dispose();
      (this.tempMarker.material as THREE.Material).dispose();
      this.tempMarker = null;
    }
    this.removeTempLines();
    this.removeTempLineLabel();
    this.firstPoint = null;
  }

  removeMeasurement(id: string) {
    const idx = this.measurements.findIndex(m => m.id === id);
    if (idx === -1) return;

    const m = this.measurements[idx];

    // 移除3D对象
    this.measureGroup.remove(
      m.solidLine, m.dashedLine,
      m.marker1, m.marker2,
      m.lineLabel,
    );

    // 释放几何体和材质
    m.solidLine.geometry.dispose();
    (m.solidLine.material as THREE.Material).dispose();
    m.dashedLine.geometry.dispose();
    (m.dashedLine.material as THREE.Material).dispose();
    m.marker1.geometry.dispose();
    (m.marker1.material as THREE.Material).dispose();
    m.marker2.geometry.dispose();
    (m.marker2.material as THREE.Material).dispose();

    // 移除CSS2D标签DOM
    m.lineLabel.element.remove();

    this.measurements.splice(idx, 1);
    this.notifyChange();
  }

  removeLastMeasurement() {
    if (this.measurements.length === 0) return;
    const last = this.measurements[this.measurements.length - 1];
    this.removeMeasurement(last.id);
  }

  clearAll() {
    [...this.measurements].forEach(m => this.removeMeasurement(m.id));
    this.cancelPending();
  }

  dispose() {
    this.clearAll();
    this.scene.remove(this.measureGroup);
    this.css2dContainer.remove();
  }

  // ─── 临时对象清理 ─────────────────────────────

  private removeTempLines() {
    if (this.tempSolidLine) {
      this.measureGroup.remove(this.tempSolidLine);
      this.tempSolidLine.geometry.dispose();
      (this.tempSolidLine.material as THREE.Material).dispose();
      this.tempSolidLine = null;
    }
    if (this.tempDashedLine) {
      this.measureGroup.remove(this.tempDashedLine);
      this.tempDashedLine.geometry.dispose();
      (this.tempDashedLine.material as THREE.Material).dispose();
      this.tempDashedLine = null;
    }
  }

  private removeTempLineLabel() {
    if (this.tempLineLabel) {
      this.measureGroup.remove(this.tempLineLabel);
      this.tempLineLabel.element.remove();
      this.tempLineLabel = null;
    }
  }

  // ─── 工厂方法 ─────────────────────────────────

  private createMarker(position: THREE.Vector3): THREE.Mesh {
    const radius = 0.3;
    const geo = new THREE.SphereGeometry(radius, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.renderOrder = 999;
    return mesh;
  }

  /** 实线 — depthTest:true，只显示可见部分，渲染在虚线之上 */
  private createSolidLine(p1: THREE.Vector3, p2: THREE.Vector3): THREE.Line {
    const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const mat = new THREE.LineBasicMaterial({
      color: 0x000000,
      depthTest: true,
      linewidth: 1,
    });
    const line = new THREE.Line(geo, mat);
    line.renderOrder = 999;
    return line;
  }

  /** 虚线 — depthTest:false，更淡更密，用于显示被遮挡的部分 */
  private createDashedLine(p1: THREE.Vector3, p2: THREE.Vector3): THREE.Line {
    const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const mat = new THREE.LineDashedMaterial({
      color: 0x000000,   // 黑色（被遮挡部分）
      dashSize: 0.6,     // 划线长度
      gapSize: 0.6,      // 间距
      depthTest: false,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    line.renderOrder = 998;
    return line;
  }

  /** 线段标签 — 长度数值，显示在线段中点 */
  private createLineLabel(text: string, position: THREE.Vector3, isPreview = false): CSS2DObject {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.cssText = `
      background: ${isPreview ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.8)'};
      color: #000000;
      font-size: 9px;
      font-weight: 700;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 0px 3px;
      border-radius: 2px;
      pointer-events: none;
      white-space: nowrap;
      user-select: none;
      transform: translate(-50%, -50%);
    `;

    const label = new CSS2DObject(div);
    label.position.copy(position);
    return label;
  }
}
