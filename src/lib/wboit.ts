import * as THREE from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';

/**
 * WBOIT (Weighted Blended Order-Independent Transparency) Renderer
 *
 * Three-pass rendering pipeline for correct transparency in medical 3D viewers:
 *
 * Pass 1 — Opaque Pass:     depthTest=true,  depthWrite=true,  standard shader (+ optional post-processing via EffectComposer)
 * Pass 2 — WBOIT Accumulation/Revealage: depthTest=true, depthWrite=false, WBOIT shader
 * Pass 3 — Compositing:     depthTest=false, depthWrite=false, full-screen quad
 *
 * Shader injection uses onBeforeCompile to inline WBOIT logic directly into
 * Three.js's material shaders (MeshPhongMaterial, MeshStandardMaterial, MeshPhysicalMaterial)
 * at the correct #include replacement points.
 * Variables like diffuseColor, outgoingLight, and mvPosition are in-scope at
 * those points, so no separate functions are needed.
 */

// ════════════════════════════════════════════════════════════════
//  Shader Chunks — declarations only (injected before main)
// ════════════════════════════════════════════════════════════════

/**
 * Vertex shader declarations: varying + uniforms for depth normalization.
 * Injected after #include <common> so they're declared before main().
 */
const WBOIT_VERT_DECLS = /* glsl */ `
varying float vNormalizedZ;
uniform float uZNear;
uniform float uZFar;
`;

/**
 * Fragment shader declarations: varying for depth.
 * Injected after #include <common> so it's declared before main().
 */
const WBOIT_FRAG_DECLS = /* glsl */ `
varying float vNormalizedZ;
`;

/**
 * Full-screen compositing shader.
 *
 * finalColor = opaqueColor * revealage + (accumulation.rgb / clamp(accumulation.a, 1e-5, 5e4)) * (1.0 - revealage)
 * Then encoded from linear to sRGB for display.
 */
const COMPOSITE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tOpaque;
uniform sampler2D tAccum;
uniform sampler2D tReveal;
varying vec2 vUv;

// Linear → sRGB encoding (matches Three.js colorspace_fragment)
vec3 linearToSRGB(vec3 value) {
  return mix(
    pow(value, vec3(0.41666)) * 1.055 - vec3(0.055),
    value * 12.92,
    vec3(lessThanEqual(value, vec3(0.0031308)))
  );
}

void main() {
  vec4 opaque    = texture2D(tOpaque, vUv);
  vec4 accum     = texture2D(tAccum,  vUv);
  float revealage = texture2D(tReveal, vUv).r;

  // Weighted average transparent color (alpha cancels out in ratio)
  vec3 transparentColor = accum.rgb / clamp(accum.a, 1e-5, 5e4);

  // McGuire compositing formula:
  //   opaque * T  +  transparentColor * (1 - T)
  // where T = Π(1 - α_i) is the total transmittance through all transparent layers.
  // (1 - T) is the total fraction of light absorbed by transparent surfaces.
  float transAmount = 1.0 - revealage;
  vec3 finalColor = opaque.rgb * revealage + transparentColor * transAmount;

  // Encode from linear to sRGB for display (opaqueRT stores linear values
  // because Pass 1 renders with outputColorSpace = LinearSRGBColorSpace).
  finalColor = linearToSRGB(finalColor);

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// ════════════════════════════════════════════════════════════════
//  Type for material that supports onBeforeCompile
// ════════════════════════════════════════════════════════════════

type WBOITCompatibleMaterial = THREE.MeshPhongMaterial | THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

interface MaterialCacheEntry {
  accumMat: WBOITCompatibleMaterial;
  revealMat: WBOITCompatibleMaterial;
  accumUniforms: { uZNear: { value: number }; uZFar: { value: number } };
  origMatRef: WBOITCompatibleMaterial;
}

// ════════════════════════════════════════════════════════════════
//  WBOITRenderer
// ════════════════════════════════════════════════════════════════

export class WBOITRenderer {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null;
  private useComposer: boolean = true;

  // Render targets
  private opaqueRT: THREE.WebGLRenderTarget | null = null;
  private accumRT: THREE.WebGLRenderTarget | null = null;
  private revealRT: THREE.WebGLRenderTarget | null = null;
  private sharedDepthTexture: THREE.DepthTexture | null = null;

  // Composite full-screen quad
  private compositeScene: THREE.Scene;
  private compositeCamera: THREE.Camera;
  private compositeMaterial: THREE.ShaderMaterial;
  private quadGeometry: THREE.PlaneGeometry;

  // Material cache
  private materialCache = new Map<string, MaterialCacheEntry>();

  // Current size
  private width = 0;
  private height = 0;

  /**
   * @param renderer The WebGL renderer
   * @param composer Optional EffectComposer for post-processing on the opaque pass (SSAO, etc.)
   */
  constructor(renderer: THREE.WebGLRenderer, composer?: EffectComposer) {
    this.renderer = renderer;
    this.composer = composer ?? null;

    // Composite scene setup
    this.quadGeometry = new THREE.PlaneGeometry(2, 2);
    this.compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: COMPOSITE_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tOpaque: { value: null },
        tAccum: { value: null },
        tReveal: { value: null },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.compositeScene = new THREE.Scene();
    this.compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(this.quadGeometry, this.compositeMaterial);
    this.compositeScene.add(quad);
  }

  // ──────────────────────────────────────────────
  //  onBeforeCompile Handlers
  // ──────────────────────────────────────────────

  /**
   * Creates an onBeforeCompile callback that injects WBOIT accumulation
   * logic into a material's shader program.
   *
   * Works with MeshPhongMaterial, MeshStandardMaterial, and MeshPhysicalMaterial.
   * All these materials share the same #include replacement points.
   *
   * Injection strategy:
   * - Declarations (varying, uniforms) are added after #include <common>
   * - Depth computation is inlined after #include <project_vertex>
   *   (mvPosition is in-scope there)
   * - Accumulation output replaces #include <output_fragment>
   *   (diffuseColor and outgoingLight are in-scope there)
   */
  private static makeAccumOnBeforeCompile(
    uniformData: { uZNear: { value: number }; uZFar: { value: number } }
  ) {
    return (shader: THREE.WebGLProgramParametersWithUniforms) => {
      // Register custom uniforms
      shader.uniforms.uZNear = uniformData.uZNear;
      shader.uniforms.uZFar = uniformData.uZFar;

      // ── Vertex shader ──

      // 1. Add declarations before main()
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\n' + WBOIT_VERT_DECLS
      );

      // 2. Inline depth computation after #include <project_vertex>
      //    At this point, mvPosition is in-scope (just computed by project_vertex)
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         vNormalizedZ = clamp((-mvPosition.z - uZNear) / (uZFar - uZNear), 0.0, 1.0);`
      );

      // ── Fragment shader ──

      // 1. Add varying declaration before main()
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\n' + WBOIT_FRAG_DECLS
      );

      // 2. Replace output with WBOIT accumulation inline
      //    At #include <output_fragment>, both diffuseColor and outgoingLight are in-scope.
      //    Normal output: gl_FragColor = vec4(outgoingLight, diffuseColor.a);
      //    WBOIT output:  weighted premultiplied color + weight sum
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <output_fragment>',
        /* glsl */ `
        float wboit_alpha = diffuseColor.a;
        float wboit_nz = vNormalizedZ;
        float wboit_weight = wboit_alpha * max(1e-2, min(3e3, 0.03 / (1e-5 + pow(wboit_nz * 2.0, 4.0))));
        gl_FragColor = vec4(outgoingLight * wboit_alpha * wboit_weight, wboit_alpha * wboit_weight);
        `
      );

      // Disable post-processing chunks that would corrupt WBOIT data
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <tone_mapping_fragment>', ''
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <colorspace_fragment>', ''
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>', ''
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <premultiplied_alpha_fragment>', ''
      );

      // For MeshPhysicalMaterial: disable transmission/thickness
      // (transmission pass renders geometry twice which conflicts with WBOIT)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <transmission_fragment>', ''
      );
    };
  }

  /**
   * onBeforeCompile for the revealage pass.
   * Outputs only alpha for multiplicative blending (ZERO, ONE_MINUS_SRC_ALPHA).
   *
   * At #include <output_fragment>, diffuseColor is in-scope.
   */
  private static revealOnBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
    // Replace output with revealage inline
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <output_fragment>',
      /* glsl */ `
      float wboit_alpha = diffuseColor.a;
      gl_FragColor = vec4(0.0, 0.0, 0.0, wboit_alpha);
      `
    );

    // Disable post-processing
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <tone_mapping_fragment>', ''
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <colorspace_fragment>', ''
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>', ''
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <premultiplied_alpha_fragment>', ''
    );

    // For MeshPhysicalMaterial: disable transmission
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <transmission_fragment>', ''
    );
  }

  // ──────────────────────────────────────────────
  //  Material Creation & Caching
  // ──────────────────────────────────────────────

  private createAccumMaterial(
    origMat: WBOITCompatibleMaterial,
    uniformData: { uZNear: { value: number }; uZFar: { value: number } }
  ): WBOITCompatibleMaterial {
    const mat = origMat.clone() as WBOITCompatibleMaterial;
    mat.transparent = true;
    mat.depthTest = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    mat.side = origMat.side;
    // Disable physical material features that conflict with WBOIT
    if (mat instanceof THREE.MeshPhysicalMaterial) {
      mat.transmission = 0;
      mat.thickness = 0;
      mat.clearcoat = 0;
      mat.ior = 1.5;
    }
    mat.onBeforeCompile = WBOITRenderer.makeAccumOnBeforeCompile(uniformData);
    mat.needsUpdate = true;
    return mat;
  }

  private createRevealMaterial(origMat: WBOITCompatibleMaterial): WBOITCompatibleMaterial {
    const mat = origMat.clone() as WBOITCompatibleMaterial;
    mat.transparent = true;
    mat.depthTest = true;
    mat.depthWrite = false;
    mat.blending = THREE.CustomBlending;
    mat.blendSrc = THREE.ZeroFactor;
    mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    mat.side = origMat.side;
    // Disable physical material features that conflict with WBOIT
    if (mat instanceof THREE.MeshPhysicalMaterial) {
      mat.transmission = 0;
      mat.thickness = 0;
      mat.clearcoat = 0;
      mat.ior = 1.5;
    }
    mat.onBeforeCompile = WBOITRenderer.revealOnBeforeCompile;
    mat.needsUpdate = true;
    return mat;
  }

  private getWBOITMaterials(
    mesh: THREE.Mesh,
    origMat: WBOITCompatibleMaterial,
    sceneZNear: number,
    sceneZFar: number
  ): { accumMat: WBOITCompatibleMaterial; revealMat: WBOITCompatibleMaterial } {
    const cacheKey = mesh.uuid;
    const cached = this.materialCache.get(cacheKey);

    // Reuse cached materials if original material reference hasn't changed
    if (cached && cached.origMatRef === origMat) {
      // Update per-frame uniforms
      cached.accumUniforms.uZNear.value = sceneZNear;
      cached.accumUniforms.uZFar.value = sceneZFar;
      // Sync color and opacity from original material
      cached.accumMat.color.copy(origMat.color);
      cached.accumMat.opacity = origMat.opacity;
      cached.revealMat.color.copy(origMat.color);
      cached.revealMat.opacity = origMat.opacity;
      return { accumMat: cached.accumMat, revealMat: cached.revealMat };
    }

    // Dispose old cached materials if material changed
    if (cached) {
      cached.accumMat.dispose();
      cached.revealMat.dispose();
    }

    // Create new WBOIT materials
    const accumUniforms = { uZNear: { value: sceneZNear }, uZFar: { value: sceneZFar } };
    const accumMat = this.createAccumMaterial(origMat, accumUniforms);
    const revealMat = this.createRevealMaterial(origMat);

    this.materialCache.set(cacheKey, {
      accumMat,
      revealMat,
      accumUniforms,
      origMatRef: origMat,
    });

    return { accumMat, revealMat };
  }

  // ──────────────────────────────────────────────
  //  Scene-Adaptive Depth Range
  // ──────────────────────────────────────────────

  /**
   * Computes the view-space Z range of transparent meshes to create a
   * meaningful normalization range for the weight function.
   */
  private computeDepthRange(
    transparentMeshes: THREE.Mesh[],
    camera: THREE.Camera
  ): { sceneZNear: number; sceneZFar: number } {
    let minViewZ = Infinity;
    let maxViewZ = -Infinity;
    const tempWorldPos = new THREE.Vector3();

    transparentMeshes.forEach((mesh) => {
      mesh.updateWorldMatrix(true, false);
      mesh.getWorldPosition(tempWorldPos);
      tempWorldPos.applyMatrix4(camera.matrixWorldInverse);
      const z = -tempWorldPos.z;
      if (z > 0) {
        minViewZ = Math.min(minViewZ, z);
        maxViewZ = Math.max(maxViewZ, z);
      }
    });

    // Fallback if no valid positions found
    if (minViewZ === Infinity) {
      const cam = camera as THREE.PerspectiveCamera;
      minViewZ = cam.near;
      maxViewZ = cam.far;
    }

    // Add padding so objects don't sit at normalizedZ = 0 or 1 exactly
    const zRange = maxViewZ - minViewZ;
    const zPadding = Math.max(zRange * 0.25, 1.0);
    return {
      sceneZNear: Math.max(0.01, minViewZ - zPadding),
      sceneZFar: maxViewZ + zPadding,
    };
  }

  // ──────────────────────────────────────────────
  //  Render Pipeline
  // ──────────────────────────────────────────────

  /**
   * Enable or disable post-processing (EffectComposer) for the opaque pass.
   * When disabled, the opaque pass uses renderer.render() directly,
   * which preserves MSAA antialiasing from the WebGLRenderer.
   * When enabled, the composer renders to a non-MSAA render target,
   * so antialiasing relies on post-process AA (e.g. SMAA).
   */
  setComposerEnabled(enabled: boolean) {
    if (this.useComposer === enabled) return;
    this.useComposer = enabled;
    // Force render target recreation to apply correct MSAA samples
    this.width = 0;
    this.height = 0;
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    this.ensureSize(size.x, size.y);

    // ── Separate opaque and transparent meshes ──
    const transparentMeshes: THREE.Mesh[] = [];
    const transparentSet = new Set<THREE.Object3D>();

    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.visible) {
        const mat = child.material as WBOITCompatibleMaterial;
        if (mat && mat.transparent && mat.opacity < 1.0) {
          transparentMeshes.push(child);
          transparentSet.add(child);
        }
      }
    });

    // No transparent objects → use composer if available AND enabled, else standard render
    if (transparentMeshes.length === 0) {
      if (this.composer && this.useComposer) {
        this.composer.render();
      } else {
        this.renderer.render(scene, camera);
      }
      return;
    }

    // ── Save state ──
    const savedMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    transparentMeshes.forEach((m) => savedMaterials.set(m, m.material));

    const savedVisibility = new Map<THREE.Object3D, boolean>();

    const prevClearColor = new THREE.Color();
    this.renderer.getClearColor(prevClearColor);
    const prevClearAlpha = this.renderer.getClearAlpha();
    const prevAutoClear = this.renderer.autoClear;
    const prevBackground = scene.background;
    const prevOutputColorSpace = this.renderer.outputColorSpace;

    try {
      // Disable auto-clear; we'll control clears manually
      this.renderer.autoClear = false;

      // ════════════════════════════════════════════════════════════════
      //  PASS 1: Opaque Pass
      //  depthTest: true, depthWrite: true
      //  Renders opaque objects + scene background to opaqueRT.
      //  If composer is available, uses it for SSAO/post-processing.
      // ════════════════════════════════════════════════════════════════
      transparentMeshes.forEach((m) => {
        m.visible = false;
      });

      // Use LinearSRGBColorSpace so opaqueRT stores linear values
      // (WBOIT accumulation is done in linear space)
      this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      this.renderer.setRenderTarget(this.opaqueRT);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear(true, true, true); // Clear color + depth + stencil

      if (this.composer) {
        // Render opaque pass through composer (applies SSAO + output pass)
        // But we need composer to write to our opaqueRT, not the screen
        // We must temporarily redirect composer's render target
        this.composer.render();
        // Copy composer output to opaqueRT
        // Actually, EffectComposer renders to its own writeBuffer.
        // We need a different approach: render directly to opaqueRT first,
        // then copy with post-processing.
        // Simpler approach: render opaque with composer to screen, then copy.
        // But that's complex. Let's use the simpler approach:
        // Render directly without composer for opaque pass when WBOIT is active,
        // and apply SSAO as a post-process on the composite result instead.
        //
        // Actually, the cleanest approach for WBOIT + SSAO:
        // The SSAO pass needs the scene's depth and normal buffers.
        // We can run SSAO on the opaqueRT result after Pass 1.
        // For now, render opaque pass directly (without composer) when WBOIT is active.
        // The SSAO effect will only apply to the no-transparent-objects case above.
        this.renderer.render(scene, camera);
      } else {
        this.renderer.render(scene, camera);
      }

      transparentMeshes.forEach((m) => {
        m.visible = true;
      });

      // Hide everything except transparent meshes for WBOIT passes
      scene.traverse((child) => {
        if (child === scene || child instanceof THREE.Light) return;
        if (!transparentSet.has(child)) {
          savedVisibility.set(child, child.visible);
          child.visible = false;
        }
      });
      scene.background = null;

      // Compute scene-adaptive depth range
      const { sceneZNear, sceneZFar } = this.computeDepthRange(transparentMeshes, camera);

      // ════════════════════════════════════════════════════════════════
      //  PASS 2a: WBOIT Accumulation
      // ════════════════════════════════════════════════════════════════
      transparentMeshes.forEach((mesh) => {
        const origMat = savedMaterials.get(mesh) as WBOITCompatibleMaterial;
        const { accumMat } = this.getWBOITMaterials(mesh, origMat, sceneZNear, sceneZFar);
        mesh.material = accumMat;
      });

      this.renderer.setRenderTarget(this.accumRT);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear(true, false, false); // Clear color ONLY — preserve opaque depth!
      this.renderer.render(scene, camera);

      // ════════════════════════════════════════════════════════════════
      //  PASS 2b: WBOIT Revealage
      // ════════════════════════════════════════════════════════════════
      transparentMeshes.forEach((mesh) => {
        const origMat = savedMaterials.get(mesh) as WBOITCompatibleMaterial;
        const { revealMat } = this.getWBOITMaterials(mesh, origMat, sceneZNear, sceneZFar);
        mesh.material = revealMat;
      });

      this.renderer.setRenderTarget(this.revealRT);
      this.renderer.setClearColor(0xffffff, 1); // revealage starts at 1.0 (fully transmissive)
      this.renderer.clear(true, false, false); // Clear color ONLY — preserve opaque depth!
      this.renderer.render(scene, camera);

      // ── Restore scene state ──
      savedMaterials.forEach((mat, mesh) => {
        mesh.material = mat;
      });
      savedVisibility.forEach((visible, obj) => {
        obj.visible = visible;
      });
      scene.background = prevBackground;
      this.renderer.outputColorSpace = prevOutputColorSpace;

      // ════════════════════════════════════════════════════════════════
      //  PASS 3: Compositing
      // ════════════════════════════════════════════════════════════════
      this.compositeMaterial.uniforms.tOpaque.value = this.opaqueRT!.texture;
      this.compositeMaterial.uniforms.tAccum.value = this.accumRT!.texture;
      this.compositeMaterial.uniforms.tReveal.value = this.revealRT!.texture;

      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(prevClearColor, prevClearAlpha);
      this.renderer.clear();
      this.renderer.render(this.compositeScene, this.compositeCamera);
    } catch (e) {
      // Restore state on error
      savedMaterials.forEach((mat, mesh) => {
        mesh.material = mat;
      });
      savedVisibility.forEach((visible, obj) => {
        obj.visible = visible;
      });
      scene.background = prevBackground;
      this.renderer.outputColorSpace = prevOutputColorSpace;
      this.renderer.autoClear = prevAutoClear;
      this.renderer.setRenderTarget(null);
      this.renderer.getClearColor(prevClearColor);
      this.renderer.setClearColor(prevClearColor, prevClearAlpha);
      throw e;
    } finally {
      this.renderer.autoClear = prevAutoClear;
    }
  }

  // ──────────────────────────────────────────────
  //  Render Target Management
  // ──────────────────────────────────────────────

  private ensureSize(width: number, height: number) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.disposeRTs();

    // Single shared depth texture — attached to all three FBOs.
    // After Pass 1 writes depth values, Pass 2 reads them via hardware depthTest.
    this.sharedDepthTexture = new THREE.DepthTexture(width, height);
    this.sharedDepthTexture.format = THREE.DepthFormat;
    this.sharedDepthTexture.type = THREE.UnsignedIntType;

    // Opaque render target (RGBA16F) — Pass 1 writes color + depth here
    // Use MSAA (samples=4) when composer is disabled for better antialiasing
    const opaqueSamples = this.useComposer ? 0 : 4;
    this.opaqueRT = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      samples: opaqueSamples,
    });
    this.opaqueRT.depthTexture = this.sharedDepthTexture;

    // Accumulation Buffer (RGBA16F) — stores weighted premultiplied color + weight sum
    this.accumRT = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
    });
    this.accumRT.depthTexture = this.sharedDepthTexture;

    // Revealage Buffer (RGBA16F) — stores transmittance Π(1 - α_i)
    this.revealRT = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
    });
    this.revealRT.depthTexture = this.sharedDepthTexture;
  }

  private disposeRTs() {
    this.opaqueRT?.dispose();
    this.accumRT?.dispose();
    this.revealRT?.dispose();
    this.sharedDepthTexture?.dispose();
    this.opaqueRT = null;
    this.accumRT = null;
    this.revealRT = null;
    this.sharedDepthTexture = null;
  }

  dispose() {
    this.disposeRTs();
    this.materialCache.forEach((entry) => {
      entry.accumMat.dispose();
      entry.revealMat.dispose();
    });
    this.materialCache.clear();
    this.compositeMaterial.dispose();
    this.quadGeometry.dispose();
  }
}
