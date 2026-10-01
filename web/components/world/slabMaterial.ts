import * as THREE from 'three'
import { MAX_LIGHTS, SLAB_HALF, SLAB_HEIGHT } from './board'
import { SLAB_EXPONENT } from './slabGeometry'

/* Frosted-glass slab shader.

   Not a transmission material: real refraction is near-invisible on a dark scene
   and needs sorted transparency. Instead every slab is opaque and the "glass" is
   built from four cheap terms that read as frosted, lit-from-below acrylic:

     1. smoked base     top/wall tone + ambient occlusion down the wall
     2. edge light      fresnel on the rounded edge + one soft key highlight
     3. bleed           lit slabs act as point lights; the walls of their
                        neighbours pick the glow up with a wrapped (subsurface-
                        like) falloff, and the floor carries it through the gaps
     4. inner glow      emissive that is hottest on the walls and rim (where light
                        leaves a slab that is lit from underneath) and more
                        saturated, matte, across the top

   Emissive values run above 1.0 so the bloom pass only catches real glow.
   All motion (entrance, breathing, hover lift, layer extrusion) is in the vertex
   shader, driven by a handful of uniforms: zero per-frame work per slab on the CPU.

   Colours are plain hex here and must track the tokens in app/globals.css. */

export const PALETTE = {
  dark: {
    bg: '#0f100e',
    gap: '#060706',
    top: '#161815',
    side: '#0c0d0b',
    rim: '#aeb5a2',
    glowHot: '#f3ffa6',
    glowDeep: '#cfdf5c',
    glowOlive: '#8f9f1c',
    glowTint: '#c9e044',
  },
  light: {
    bg: '#edeee8',
    gap: '#c3c6b9',
    top: '#f8f9f4',
    side: '#d6d9cc',
    rim: '#ffffff',
    glowHot: '#e2fa5a',
    glowDeep: '#b4d42a',
    glowOlive: '#bcdc3c',
    glowTint: '#c2e335',
  },
} as const

const common = /* glsl */ `
  #define NUM_LIGHTS ${MAX_LIGHTS}
  #define HALF ${SLAB_HALF.toFixed(4)}
  #define HEIGHT ${SLAB_HEIGHT.toFixed(4)}
  #define EXPO ${SLAB_EXPONENT.toFixed(3)}

  uniform vec4 uLights[NUM_LIGHTS];   // xyz world position, w intensity
  uniform vec3 uBg;
  uniform vec3 uGap;
  uniform vec3 uGlowTint;
  uniform float uTheme;               // 0 dark .. 1 light
  uniform float uDim;                 // 0 world faded out .. 1 full presence
  uniform vec2 uFocus;                // fog centre (world xz)
  uniform vec2 uFog;                  // near, far
  uniform vec2 uRes;                  // drawing-buffer size
  uniform vec4 uFade;                 // dir.xy, strength, offset — keeps the text side quiet

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  /* how present the world is at this fragment: fog away from the focus, a
     directional fade under the headline, and the per-route dim. */
  float presence(vec3 world) {
    float fog = smoothstep(uFog.y, uFog.x, distance(world.xz, uFocus));
    vec2 suv = gl_FragCoord.xy / uRes - 0.5;
    float along = dot(suv, uFade.xy) + uFade.w;
    float side = mix(1.0, smoothstep(-0.34, 0.14, along), uFade.z);
    return fog * side * uDim;
  }
`

const slabVertex = /* glsl */ `
  attribute vec3 aOffset;   // x, resting y, z
  attribute vec4 aLit;      // per scene
  attribute vec4 aLift;     // per scene
  attribute vec4 aShow;     // per scene (1 for base slabs)
  attribute vec4 aMisc;     // seed, kind (0 slab / 1 upper layer), cloud, entrance delay

  uniform vec4 uW;          // scene weights
  uniform float uTime;
  uniform float uIntro;     // 0..1 entrance
  uniform vec3 uPointer;    // world x, world z, strength

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vLocal;
  varying float vLit;
  varying float vKind;
  varying float vSeed;
  varying float vCloud;
  varying float vAppear;

  void main() {
    float seed = aMisc.x;
    float kind = aMisc.y;
    float lit = dot(aLit, uW);
    float lift = dot(aLift, uW);
    float show = clamp(dot(aShow, uW), 0.0, 1.0);

    // entrance: slabs rise into place, rippling out from the lit cluster
    float t = clamp(uIntro * 1.9 - aMisc.w * 0.9, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - t, 3.0);

    // idle: a slow breath; floating slabs drift a little more
    float raised = smoothstep(0.02, 0.2, lift);
    float breathe = sin(uTime * 0.55 + seed * 6.2831) * (0.005 + 0.011 * raised);

    // hover: slabs near the pointer lift a few px
    float hd = distance(aOffset.xz, uPointer.xy);
    float hover = uPointer.z * smoothstep(1.7, 0.0, hd);
    hover *= hover;

    vec3 p = position;
    // an upper layer extrudes out of the slab beneath it
    p.y *= mix(1.0, show, kind);
    float y = aOffset.y + lift * mix(1.0, show, kind) + breathe + hover * 0.062 - (1.0 - e) * 0.5;

    vec3 world = vec3(aOffset.x + p.x, y + p.y, aOffset.z + p.z);
    vWorld = world;
    vNormal = normal;
    vLocal = position;
    vLit = lit * (1.0 + 0.05 * sin(uTime * 0.8 + seed * 12.0));
    vKind = kind;
    vSeed = seed;
    vCloud = aMisc.z;
    vAppear = e * mix(1.0, smoothstep(0.0, 0.2, show), kind);

    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
    // a fully retracted upper layer is coplanar with its slab: drop it
    if (kind > 0.5 && show < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`

const slabFragment = /* glsl */ `
  precision highp float;
  ${common}
  uniform vec3 uTop;
  uniform vec3 uSide;
  uniform vec3 uRim;
  uniform vec3 uGlowHot;
  uniform vec3 uGlowDeep;
  uniform vec3 uGlowOlive;
  uniform vec3 uViewDir;    // surface → camera
  uniform vec3 uKeyDir;     // surface → key light
  uniform vec2 uGradDir;    // key light, flattened onto the board
  uniform float uGlow;      // global emissive gain

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vLocal;
  varying float vLit;
  varying float vKind;
  varying float vSeed;
  varying float vCloud;
  varying float vAppear;

  // approximate inward distance from the squircle outline (exact on the axes)
  float edgeDistance(vec2 p) {
    vec2 q = abs(p) / HALF;
    float f = pow(pow(q.x, EXPO) + pow(q.y, EXPO), 1.0 / EXPO);
    return (1.0 - f) * HALF;
  }

  void main() {
    vec3 N = normalize(vNormal);
    float up = clamp(N.y, 0.0, 1.0);
    float wall = 1.0 - up;
    float depth = clamp(-vLocal.y / HEIGHT, 0.0, 1.0);          // 0 top .. 1 bottom
    float edge = edgeDistance(vLocal.xz);                         // 0 at outline
    float rimBand = 1.0 - smoothstep(0.0, 0.085, edge);           // the lip you see through the top
    float lip = smoothstep(0.045, 0.062, edge) - smoothstep(0.062, 0.1, edge);
    float centre = smoothstep(0.0, 1.0, edge / HALF);

    float ndv = clamp(dot(N, uViewDir), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 3.0);
    vec3 H = normalize(uKeyDir + uViewDir);
    float spec = pow(max(dot(N, H), 0.0), 28.0);
    float key = clamp(dot(N, uKeyDir) * 0.5 + 0.5, 0.0, 1.0);

    // ---- 1 · smoked base ----
    vec3 base = mix(uSide, uTop, up);
    base *= mix(0.86, 1.1, key);                                  // broad, matte key
    base *= 1.0 + up * dot(vLocal.xz, uGradDir) / HALF * 0.09;
    base *= 1.0 - wall * depth * mix(0.55, 0.3, uTheme);          // occlusion down the wall
    base *= 1.0 + up * (lip * 0.1 - centre * 0.05);               // faint inner contour
    base *= 1.0 - vCloud * 0.07 * (1.0 - uTheme);                 // never-stated slabs sit duller
    // ---- 2 · edge light ----
    base += uRim * (fres * mix(0.16, 0.35, uTheme) + spec * mix(0.2, 0.3, uTheme)) * mix(1.0, 0.75, vCloud);

    // ---- 3 · bleed from lit neighbours ----
    // walls that face a lit slab take the glow; tops stay smoked and only graze it
    float bleed = 0.0;
    for (int i = 0; i < NUM_LIGHTS; i++) {
      vec3 L = uLights[i].xyz - vWorld;
      float d2 = dot(L, L);
      float att = uLights[i].w / (1.0 + d2 * 6.0 + d2 * d2 * 13.0);
      float ndl = dot(N, L * inversesqrt(d2 + 1e-4));
      float wrap = clamp(ndl * 0.85 + 0.15, 0.0, 1.0);
      bleed += att * (wrap * wrap + up * 0.012);
    }
    bleed *= uGlow;
    float tintAmt = 1.0 - exp(-bleed * mix(2.7, 2.2, uTheme));
    vec3 col = mix(base, uGlowTint * mix(0.7, 0.98, uTheme), tintAmt * mix(0.92, 0.72, uTheme));

    // ---- 4 · inner glow ----
    float lit = vLit * uGlow;
    // dark: any light at all turns the smoked slab olive. light: a dim slab is a
    // pale slab with a lime cast, so coverage follows the level instead.
    float cover = mix(smoothstep(0.0, 0.3, lit), smoothstep(0.0, 0.85, lit), uTheme * (1.0 - vKind));
    float level = pow(clamp(lit, 0.0, 1.5), 1.4);                  // how bright that light is
    float hdr = mix(1.4, 1.0, uTheme);
    float floorLevel = uTheme;                                     // on a pale ground the glow never darkens
    float sheen = dot(vLocal.xz, uGradDir) / HALF;                 // matte falloff across the top
    // a lit slab: the top is saturated and matte, the rim and walls run hot
    // (a dim slab is a deeper, more saturated olive rather than a grey-green)
    vec3 body = mix(uGlowOlive, uGlowDeep, smoothstep(0.12, 0.85, level));
    float heat = smoothstep(0.08, 0.8, level);                     // only a bright slab runs pale-hot
    vec3 topGlow = mix(body, uGlowHot, (0.5 * rimBand + 0.1 * lip) * heat) * (1.0 + sheen * 0.06 + rimBand * 0.3 * (1.0 - heat));
    vec3 wallGlow = mix(body, uGlowHot, (0.4 + 0.6 * depth) * heat) * mix(1.25, hdr, heat);
    vec3 slabGlow = mix(wallGlow, topGlow, up) * mix(floorLevel, 1.0, level);
    // an upper layer: olive, lit through from underneath, brightest along its lower edge
    float under = clamp(lit, 0.0, 1.2);
    float low = wall * depth * depth;
    vec3 olive = mix(uGlowOlive, uGlowDeep, under * under) * mix(mix(0.07, 0.56, under * sqrt(under)), mix(0.84, 0.98, under), uTheme);
    olive *= 1.0 + up * (sheen * 0.28 - centre * 0.1) + rimBand * 0.22;
    vec3 layerGlow = mix(olive, mix(uGlowDeep, uGlowHot, under * under) * hdr * 0.9 * mix(min(under, 1.0), 1.0, uTheme), low);
    vec3 glow = mix(slabGlow, layerGlow, vKind);
    col = mix(col, glow, cover);
    // the edge light survives on a lit slab, so it still reads as glass
    col += uRim * (fres * 0.08 + spec * 0.1) * cover;

    // roughness grain
    float grain = hash12(gl_FragCoord.xy + vSeed * 91.7) - 0.5;
    col *= 1.0 + grain * mix(0.13, 0.035, uTheme) * (0.7 + up * 0.5 + vCloud * 0.25) * mix(1.0, 0.45, cover);

    float vis = presence(vWorld) * vAppear;
    // lit slabs keep their presence a little longer than dark ones as the world dims
    vis = mix(vis, sqrt(vis), cover * 0.6);
    col = mix(uBg, col, vis);

    gl_FragColor = vec4(max(col, 0.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const groundVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

const groundFragment = /* glsl */ `
  precision highp float;
  ${common}
  uniform float uGlow;
  uniform float uBoardHalf;   // half-extent of the board
  uniform float uIntro;
  varying vec3 vWorld;

  void main() {
    // the floor only exists under the board; beyond it there is just background
    vec2 q = abs(vWorld.xz);
    float inside = 1.0 - smoothstep(uBoardHalf - 0.4, uBoardHalf + 0.1, max(q.x, q.y));
    vec3 col = uGap;

    float glow = 0.0;
    for (int i = 0; i < NUM_LIGHTS; i++) {
      vec3 L = uLights[i].xyz - vWorld;
      float d2 = dot(L, L);
      glow += uLights[i].w / (1.0 + d2 * 7.0 + d2 * d2 * 22.0);
    }
    glow *= uGlow;
    col = mix(col, uGlowTint * mix(1.25, 1.0, uTheme), 1.0 - exp(-glow * 1.9));

    float vis = presence(vWorld) * inside * smoothstep(0.0, 0.5, uIntro);
    col = mix(uBg, col, vis);

    gl_FragColor = vec4(max(col, 0.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export interface WorldUniforms {
  [uniform: string]: THREE.IUniform
  uLights: { value: THREE.Vector4[] }
  uBg: { value: THREE.Color }
  uGap: { value: THREE.Color }
  uTop: { value: THREE.Color }
  uSide: { value: THREE.Color }
  uRim: { value: THREE.Color }
  uGlowHot: { value: THREE.Color }
  uGlowDeep: { value: THREE.Color }
  uGlowOlive: { value: THREE.Color }
  uGlowTint: { value: THREE.Color }
  uTheme: { value: number }
  uDim: { value: number }
  uGlow: { value: number }
  uFocus: { value: THREE.Vector2 }
  uFog: { value: THREE.Vector2 }
  uRes: { value: THREE.Vector2 }
  uFade: { value: THREE.Vector4 }
  uW: { value: THREE.Vector4 }
  uTime: { value: number }
  uIntro: { value: number }
  uPointer: { value: THREE.Vector3 }
  uViewDir: { value: THREE.Vector3 }
  uKeyDir: { value: THREE.Vector3 }
  uGradDir: { value: THREE.Vector2 }
  uBoardHalf: { value: number }
}

/** One uniform set shared by the slab and floor materials, so the scene writes
 *  each value once per frame. */
export function createWorldUniforms(): WorldUniforms {
  const lights: THREE.Vector4[] = []
  for (let i = 0; i < MAX_LIGHTS; i++) lights.push(new THREE.Vector4(0, -100, 0, 0))
  return {
    uLights: { value: lights },
    uBg: { value: new THREE.Color(PALETTE.dark.bg) },
    uGap: { value: new THREE.Color(PALETTE.dark.gap) },
    uTop: { value: new THREE.Color(PALETTE.dark.top) },
    uSide: { value: new THREE.Color(PALETTE.dark.side) },
    uRim: { value: new THREE.Color(PALETTE.dark.rim) },
    uGlowHot: { value: new THREE.Color(PALETTE.dark.glowHot) },
    uGlowDeep: { value: new THREE.Color(PALETTE.dark.glowDeep) },
    uGlowOlive: { value: new THREE.Color(PALETTE.dark.glowOlive) },
    uGlowTint: { value: new THREE.Color(PALETTE.dark.glowTint) },
    uTheme: { value: 0 },
    uDim: { value: 1 },
    uGlow: { value: 0 },
    uFocus: { value: new THREE.Vector2() },
    uFog: { value: new THREE.Vector2(2.4, 6.2) },
    uRes: { value: new THREE.Vector2(1, 1) },
    uFade: { value: new THREE.Vector4(1, 0, 0, 0) },
    uW: { value: new THREE.Vector4(1, 0, 0, 0) },
    uTime: { value: 0 },
    uIntro: { value: 0 },
    uPointer: { value: new THREE.Vector3(0, 0, 0) },
    uViewDir: { value: new THREE.Vector3(0, 1, 0) },
    uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
    uGradDir: { value: new THREE.Vector2(1, 0) },
    uBoardHalf: { value: 5 },
  }
}

export function createSlabMaterial(uniforms: WorldUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: slabVertex,
    fragmentShader: slabFragment,
    uniforms,
  })
}

export function createGroundMaterial(uniforms: WorldUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: groundVertex,
    fragmentShader: groundFragment,
    uniforms,
  })
}
