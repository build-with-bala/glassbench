import * as THREE from 'three'
import { CELL_MAX_HEIGHT, CELL_MIN_HEIGHT, CELL_RADIUS, CELL_SHOULDER, PITCH, ROW_PITCH } from './plate'

/* Shaders for the glass board.

   Three kinds of surface, drawn in this order:

     plate + floor   opaque. The plate's shader finds the cells around each fragment
                     (the layout is a staggered grid, so that is arithmetic, not a
                     search) and paints their sockets, contact shadows, cast shadows
                     and the pools of light that lit cells spill onto it.
     cores           opaque. The column of light inside each cell: calm blue for a
                     right answer, ember for a wrong one, burning when it was
                     confidently wrong.
     shells          real alpha-blended glass, back faces then front faces, cells
                     sorted far to near. Clear glass is a thin smoked body plus
                     additive rim and specular light (premultiplied output, so the
                     reflections are not dimmed by the body's low alpha) and you see
                     the core through it. Frosted glass turns the same shell nearly
                     opaque and diffuse, hiding whatever is inside.

   Per-cell state (height, frost, light, emphasis...) lives in two tiny float
   textures, one texel per cell. The CPU eases those values and uploads 2 x 96
   texels; every shader reads them, so nothing per-cell is recomputed in JS and the
   plate can see its neighbours' state.

   Colours are plain hex and must track the tokens in app/globals.css (`--bg`
   especially, or the canvas shows a seam; `cool` is the brand accent, `hot` the
   colour of "confidently wrong"). */

export const PALETTE = {
  dark: {
    bg: '#0b0d12',
    floorGlow: '#0e1118',
    plate: '#10141c',
    plateEdge: '#5c6f8c',
    smoke: '#0a0e15',
    rim: '#cfe6ff',
    cool: '#a9d8ff',
    coolDeep: '#3f95ec',
    warm: '#c27a2c',
    hot: '#ff5a1f',
    hotCore: '#ffc873',
    hotDeep: '#b3122d',
    frost: '#aab6ca',
    coreDark: '#161c27',
    shadow: '#020305',
  },
  light: {
    bg: '#edf0f5',
    floorGlow: '#dfe6f0',
    plate: '#e2e7ef',
    plateEdge: '#ffffff',
    smoke: '#4f6a8c',
    rim: '#ffffff',
    cool: '#7cc6ff',
    coolDeep: '#2a86e4',
    warm: '#d98a2b',
    hot: '#ff4d12',
    hotCore: '#ffb347',
    hotDeep: '#cf0f32',
    frost: '#f7f9fc',
    coreDark: '#b4c0d2',
    shadow: '#7b8aa3',
  },
} as const

export type PaletteKey = keyof (typeof PALETTE)['dark']
export const PALETTE_KEYS = Object.keys(PALETTE.dark) as PaletteKey[]

const uniformName = (k: PaletteKey) => `u${k[0].toUpperCase()}${k.slice(1)}`

const defines = /* glsl */ `
  #define PITCH ${PITCH.toFixed(4)}
  #define ROW_PITCH ${ROW_PITCH.toFixed(4)}
  #define CELL_R ${CELL_RADIUS.toFixed(4)}
  #define H_MIN ${CELL_MIN_HEIGHT.toFixed(4)}
  #define H_MAX ${CELL_MAX_HEIGHT.toFixed(4)}
  #define SHOULDER ${CELL_SHOULDER.toFixed(4)}
`

const shared = /* glsl */ `
  ${defines}
  uniform vec3 uBg;
  uniform vec3 uCool;
  uniform vec3 uCoolDeep;
  uniform vec3 uWarm;
  uniform vec3 uHot;
  uniform vec3 uHotCore;
  uniform vec3 uHotDeep;
  uniform vec3 uRim;
  uniform float uTheme;     // 0 dark .. 1 light
  uniform float uDim;       // 0 the world has receded .. 1 fully present
  uniform float uGlow;      // emissive gain (entrance, scroll)
  uniform float uTime;
  uniform vec3 uKeyDir;     // surface -> key light

  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  /* The light a cell holds, as a colour. cool = calm blue. heat = wrong: below full
     heat it is only a warm coal (wrong, but not confidently); at full heat it burns. */
  vec3 innerLight(float cool, float heat, float flicker) {
    float burning = smoothstep(0.6, 1.0, heat);
    vec3 ember = mix(uHotDeep, uHot, 0.45 + 0.55 * flicker);
    return uCool * cool * 0.9 + mix(uWarm * 0.16, ember, burning) * heat;
  }
`

/* ---- vertex stage shared by cores and shells ------------------------------ */
const cellVertex = (kind: 'shell' | 'core') => /* glsl */ `
  attribute float aBody;
  attribute vec2 aCell;      // texel centre in the state textures
  attribute vec3 aBase;      // x, z, seed

  uniform sampler2D uStateA; // height, frost, cool, heat
  uniform sampler2D uStateB; // emphasis, lift, focus, appear
  uniform float uTime;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec4 vA;
  varying vec4 vB;
  varying float vSeed;
  varying float vUp;         // 0 at the foot .. 1 at the top of the cell
  varying float vTop;        // world y of the top of the cell

  ${defines}

  void main() {
    vec4 A = texture2D(uStateA, aCell);
    vec4 B = texture2D(uStateB, aCell);
    float appear = B.w;
    float body = mix(H_MIN, H_MAX, A.x) * appear;
    float lift = B.y;
    vec3 p = position;
    ${
      kind === 'core'
        ? /* glsl */ `
    // the column stops short of the glass around it and vanishes with it
    float inner = max(body - 0.05, 0.0);
    float s = smoothstep(0.0, 0.16, inner);
    p.xz *= mix(0.55, 1.0, s);
    p.y *= s;
    float y = aBody * inner + p.y + 0.012;
    float top = inner + 0.2;`
        : /* glsl */ `
    float y = aBody * body + p.y * smoothstep(0.0, 0.2, appear);
    float top = body + SHOULDER + 0.03;`
    }
    vec3 world = vec3(aBase.x + p.x, y + lift, aBase.y + p.z);
    vWorld = world;
    vNormal = normal;
    vA = A;
    vB = B;
    vSeed = aBase.z;
    vUp = clamp(y / max(top, 0.001), 0.0, 1.0);
    vTop = top + lift;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`

const coreFragment = /* glsl */ `
  precision highp float;
  ${shared}
  uniform vec3 uCoreDark;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec4 vA;
  varying vec4 vB;
  varying float vSeed;
  varying float vUp;
  varying float vTop;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float cool = vA.z;
    float heat = vA.w;
    float emph = vB.x;

    // an unlit core is a dark glass rod: structure inside the smoke
    vec3 col = uCoreDark * (0.55 + 0.6 * ndv) + uRim * pow(1.0 - ndv, 3.0) * mix(0.05, 0.12, uTheme);

    // fire rises: noise scrolls up the column, faster and brighter when it burns
    float burning = smoothstep(0.6, 1.0, heat);
    float n = vnoise(vec2(vWorld.y * 3.4 - uTime * (0.5 + 1.3 * burning) + vSeed * 40.0, vSeed * 91.0 + uTime * 0.21));
    float flicker = mix(0.6, n, 0.35 + 0.5 * burning);
    float breath = 0.95 + 0.05 * sin(uTime * 0.9 + vSeed * 30.0);

    // the light is densest on the axis and at the top, where it leaves the column.
    // It stays under 1.0 so it reads as blue, not as a white that happens to be blue.
    float axis = 0.45 + 0.55 * ndv;
    float crown = smoothstep(0.5, 1.0, vUp);
    vec3 coolCol = mix(uCoolDeep, uCool, clamp(0.05 + 0.75 * ndv * ndv + 0.4 * crown, 0.0, 1.0)) * mix(0.5 + 0.34 * ndv + 0.2 * crown, 0.86 + 0.14 * ndv, uTheme) * breath;

    // wrong but not confident: warm smoked glass with a coal low in the column
    float coal = (1.0 - smoothstep(0.0, 0.5, vUp)) * (0.55 + 0.45 * n);
    vec3 coalCol = mix(uCoreDark * 1.2, uWarm, 0.06 + 0.62 * coal * coal) * (0.5 + 0.5 * axis);
    // confidently wrong: it burns
    vec3 flame = mix(uHotDeep, uHot, clamp(0.25 + 0.9 * flicker * axis, 0.0, 1.0));
    flame = mix(flame, uHotCore, smoothstep(0.55, 1.0, flicker * axis + 0.25 * crown));
    flame *= (0.85 + 0.5 * flicker) * mix(1.7, 1.12, uTheme);

    float gain = uGlow * mix(0.12, 1.0, emph);
    col = mix(col, coolCol, clamp(cool * gain, 0.0, 1.0));
    col = mix(col, mix(coalCol, flame, burning), clamp(heat * 2.4 * gain, 0.0, 1.0));

    col = mix(uBg, col, uDim);
    gl_FragColor = vec4(max(col, 0.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const shellFragment = /* glsl */ `
  precision highp float;
  ${shared}
  uniform vec3 uSmoke;
  uniform vec3 uFrost;
  uniform float uBack;      // 1 while drawing the inside of the far wall
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec4 vA;
  varying vec4 vB;
  varying float vSeed;
  varying float vUp;
  varying float vTop;

  void main() {
    vec3 N = normalize(vNormal);
    if (uBack > 0.5) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 4.2);
    float up = clamp(normalize(vNormal).y, 0.0, 1.0);        // 1 on the top lens

    float frost = vA.y;
    float cool = vA.z;
    float heat = vA.w;
    float emph = vB.x;
    float focus = vB.z;
    float gain = uGlow * mix(0.1, 1.0, emph);

    float flicker = vnoise(vec2(uTime * 1.7 + vSeed * 50.0, vSeed * 13.0));
    vec3 inner = innerLight(cool, heat, flicker) * gain;
    float innerAmt = clamp(max(cool, heat) * gain, 0.0, 1.0);

    vec3 H = normalize(uKeyDir + V);
    float spec = pow(max(dot(N, H), 0.0), 90.0);
    float sheen = pow(max(dot(N, H), 0.0), 14.0);
    float key = clamp(dot(N, uKeyDir) * 0.5 + 0.5, 0.0, 1.0);

    // ---- clear glass: a thin smoked body, light added on top ----
    // dark theme: edges catch light. light theme: edges go darker, as glass does in a bright room.
    float bodyA = mix(0.07 + 0.55 * fres, 0.07 + 0.5 * pow(1.0 - ndv, 2.2), uTheme);
    vec3 clearRgb = uSmoke * bodyA;                                    // premultiplied body
    vec3 add = uRim * (fres * mix(0.42, 0.1, uTheme) + spec * mix(1.2, 0.9, uTheme) + sheen * mix(0.015, 0.14, uTheme));
    // the lit column colours the glass around it, most where the light leaves: the top lens
    add += inner * (0.03 + 0.2 * up + 0.3 * fres + 0.1 * ndv * ndv) * mix(1.0, 0.55, uTheme);
    float clearA = bodyA + innerAmt * up * 0.25;

    // ---- frosted glass: nearly opaque, diffuse, hides what is inside ----
    // sandblasted: bright where the wall turns away from you, dim where you look through it
    vec3 frostRgb = uFrost * mix(0.07 + 0.13 * key + 0.5 * pow(1.0 - ndv, 1.7) + 0.1 * up, 0.7 + 0.3 * key, uTheme);
    frostRgb *= 1.0 - (1.0 - vUp) * mix(0.45, 0.14, uTheme);            // darker toward the foot
    frostRgb += uRim * (fres * mix(0.22, 0.0, uTheme) + spec * 0.25);
    frostRgb += inner * (0.1 + 0.55 * ndv * ndv) * (0.5 + 0.5 * vUp);  // a glow trapped behind the frost
    float grain = hash12(gl_FragCoord.xy + vSeed * 77.0) - 0.5;
    frostRgb *= 1.0 + grain * mix(0.16, 0.04, uTheme);
    float frostA = mix(0.86, 0.94, uTheme);

    vec3 rgb = mix(clearRgb + add, frostRgb * frostA, frost);
    float a = mix(clearA, frostA, frost);

    // a receded cell loses its reflections and most of its body
    float present = mix(0.32, 1.0, emph);
    rgb *= present;
    a *= mix(0.45, 1.0, emph);

    // the cell under the pointer / the current item: an accent edge
    rgb += uCool * focus * (0.25 + 0.75 * fres + 0.35 * up) * mix(1.0, 0.7, uTheme);
    a = min(1.0, a + focus * 0.12);

    if (uBack > 0.5) {
      // inside of the far wall: only clear glass shows it
      float through = (1.0 - frost) * 0.5;
      rgb *= through;
      a *= through;
    }

    rgb *= uDim;
    a *= uDim;
    gl_FragColor = vec4(max(rgb, 0.0), clamp(a, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const plateVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

/* Walks the cells around a point on the plate. The layout is a staggered grid, so the
   candidates are the 3 x 3 block around the nearest row/column. */
const neighbourhood = /* glsl */ `
  uniform sampler2D uStateA;
  uniform sampler2D uStateB;
  uniform vec2 uGrid;        // cols, rows
  uniform float uCount;      // cells actually present (the last column may be short)
  uniform vec2 uShadowDir;   // direction a shadow falls on the plate (xz, unit)

  struct Around {
    float socket;   // 1 on a socket lip
    float contact;  // 0..1 occlusion next to a cell
    float shadow;   // 0..1 cast shadow
    vec3 pool;      // light spilled by lit cells
    float ring;     // highlight ring of an emphasised / focused cell
  };

  Around lookAround(vec2 p) {
    Around o = Around(0.0, 0.0, 0.0, vec3(0.0), 0.0);
    float rowF = p.y / ROW_PITCH + (uGrid.y - 1.0) * 0.5;
    float r0 = floor(rowF + 0.5);
    for (int dr = -1; dr <= 1; dr++) {
      float row = r0 + float(dr);
      if (row < 0.0 || row > uGrid.y - 1.0) continue;
      float stagger = mod(row, 2.0) < 0.5 ? -0.25 : 0.25;
      float colF = p.x / PITCH + (uGrid.x - 1.0) * 0.5 - stagger;
      float c0 = floor(colF + 0.5);
      for (int dc = -1; dc <= 1; dc++) {
        float col = c0 + float(dc);
        if (col < 0.0 || col > uGrid.x - 1.0) continue;
        if (col * uGrid.y + row > uCount - 0.5) continue;
        vec2 centre = vec2((col - (uGrid.x - 1.0) * 0.5 + stagger) * PITCH, (row - (uGrid.y - 1.0) * 0.5) * ROW_PITCH);
        vec2 uv = (vec2(col, row) + 0.5) / uGrid;
        vec4 A = texture2D(uStateA, uv);
        vec4 B = texture2D(uStateB, uv);
        float appear = B.w;
        float d = distance(p, centre);
        float edge = d - CELL_R;

        o.socket = max(o.socket, (1.0 - smoothstep(0.0, 0.035, abs(edge - 0.035))) * appear);
        o.contact = max(o.contact, (1.0 - smoothstep(0.0, 0.3, edge)) * appear);

        // cast shadow: the cell's footprint swept along the light direction, longer for taller cells
        float tall = (mix(H_MIN, H_MAX, A.x) + SHOULDER) * appear;
        vec2 rel = p - centre;
        float along = clamp(dot(rel, uShadowDir), 0.0, tall * 0.95);
        float sd = length(rel - uShadowDir * along) - CELL_R;
        float swept = (1.0 - smoothstep(-0.03, 0.12 + along * 0.22, sd)) * (1.0 - 0.45 * along / max(tall, 0.01));
        // frosted glass blocks light; clear glass lets most of it through
        o.shadow = max(o.shadow, swept * mix(0.38, 0.85, A.y) * appear);

        float lit = max(A.z, A.w) * mix(0.1, 1.0, B.x) * appear;
        float flicker = vnoise(vec2(uTime * 1.7 + col * 7.1, row * 3.3));
        float fall = exp(-max(edge, 0.0) * 5.5) * (0.45 + 0.55 * A.x);
        o.pool += innerLight(A.z, A.w, flicker) * vec3(0.72, 0.9, 1.12) * fall * mix(0.1, 1.0, B.x) * appear * step(0.001, lit);

        float ringD = abs(edge - 0.1);
        o.ring = max(o.ring, (1.0 - smoothstep(0.012, 0.05, ringD)) * B.z);
      }
    }
    return o;
  }
`

const plateFragment = /* glsl */ `
  precision highp float;
  ${shared}
  ${neighbourhood}
  uniform vec3 uPlate;
  uniform vec3 uPlateEdge;
  uniform vec3 uShadow;
  varying vec3 vWorld;
  varying vec3 vNormal;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorld);
    float up = clamp(N.y, 0.0, 1.0);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 3.0);
    float key = clamp(dot(N, uKeyDir) * 0.5 + 0.5, 0.0, 1.0);

    vec3 col = uPlate * mix(0.7, 1.12, key);
    // the wall of the slab and its rounded edge catch the light
    col = mix(col, uPlate * mix(0.55, 0.86, uTheme), (1.0 - up) * 0.8);
    vec3 H = normalize(uKeyDir + V);
    col += uPlateEdge * (pow(max(dot(N, H), 0.0), 40.0) * mix(0.5, 0.4, uTheme) + fres * (1.0 - up) * mix(0.16, 0.0, uTheme));

    if (up > 0.5) {
      Around o = lookAround(vWorld.xz);
      float shade = max(o.contact * 0.55, o.shadow);
      col = mix(col, uShadow, shade * mix(0.8, 0.42, uTheme));
      col += uPlateEdge * o.socket * mix(0.1, 0.5, uTheme);
      vec3 pool = o.pool * uGlow;
      // dark: light adds. light: light tints the pale plate (adding would only whiten it)
      vec3 lit = col + pool * 0.42;
      vec3 tinted = mix(col, col * (0.35 + 0.65 * normalize(pool + 1e-4) * 1.7), clamp(length(pool) * 0.9, 0.0, 0.85));
      col = mix(lit, tinted, uTheme);
      col = mix(col, uCool * mix(1.25, 0.85, uTheme), o.ring);
      col *= 1.0 + (hash12(gl_FragCoord.xy) - 0.5) * mix(0.1, 0.025, uTheme);
    }

    col = mix(uBg, col, uDim);
    gl_FragColor = vec4(max(col, 0.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const floorFragment = /* glsl */ `
  precision highp float;
  ${shared}
  uniform vec3 uFloorGlow;
  uniform vec3 uShadow;
  uniform vec2 uPlateHalf;   // half-extent of the plate
  uniform vec3 uSpill;       // average light the board is giving off
  varying vec3 vWorld;
  varying vec3 vNormal;

  float roundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    float d = roundedBox(vWorld.xz, uPlateHalf, 0.7);         // <0 under the plate
    vec3 col = uBg;
    // the board's own light pooling on the table around it
    float halo = exp(-max(d, 0.0) * 0.8);
    col = mix(col, uFloorGlow, halo * 0.55);
    vec3 spill = uSpill * uGlow * exp(-max(d, 0.0) * 1.5);
    col = mix(col + spill * 0.22, mix(col, col * (0.5 + normalize(spill + 1e-4)), clamp(length(spill) * 1.4, 0.0, 0.5)), uTheme);
    // contact shadow where the slab meets the table
    float contact = 1.0 - smoothstep(-0.2, 0.95, d);
    col = mix(col, uShadow, contact * mix(0.9, 0.5, uTheme));
    // everything dissolves into the page background well before the plane ends
    float reach = 1.0 - smoothstep(2.5, 9.0, d);
    col = mix(uBg, col, reach * uDim);
    gl_FragColor = vec4(max(col, 0.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export interface WorldUniforms {
  [uniform: string]: THREE.IUniform
  uStateA: { value: THREE.DataTexture | null }
  uStateB: { value: THREE.DataTexture | null }
  uGrid: { value: THREE.Vector2 }
  uCount: { value: number }
  uShadowDir: { value: THREE.Vector2 }
  uPlateHalf: { value: THREE.Vector2 }
  uSpill: { value: THREE.Color }
  uKeyDir: { value: THREE.Vector3 }
  uTheme: { value: number }
  uDim: { value: number }
  uGlow: { value: number }
  uTime: { value: number }
}

/** One uniform set shared by every material, so the scene writes each value once. */
export function createWorldUniforms(): WorldUniforms {
  const u: Record<string, THREE.IUniform> = {
    uStateA: { value: null },
    uStateB: { value: null },
    uGrid: { value: new THREE.Vector2(1, 1) },
    uCount: { value: 0 },
    uShadowDir: { value: new THREE.Vector2(1, 0) },
    uPlateHalf: { value: new THREE.Vector2(1, 1) },
    uSpill: { value: new THREE.Color(0, 0, 0) },
    uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
    uTheme: { value: 0 },
    uDim: { value: 1 },
    uGlow: { value: 0 },
    uTime: { value: 0 },
  }
  for (const k of PALETTE_KEYS) u[uniformName(k)] = { value: new THREE.Color(PALETTE.dark[k]) }
  return u as WorldUniforms
}

export function paletteUniform(u: WorldUniforms, k: PaletteKey): THREE.Color {
  return u[uniformName(k)].value as THREE.Color
}

export function createCoreMaterial(uniforms: WorldUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: cellVertex('core'), fragmentShader: coreFragment, uniforms })
}

/** Glass shell. Two instances are drawn: `back` = the inside of the far wall first,
 *  then the near wall over it. Each gets its own `uBack` but shares everything else. */
export function createShellMaterial(uniforms: WorldUniforms, back: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: cellVertex('shell'),
    fragmentShader: shellFragment,
    uniforms: { ...uniforms, uBack: { value: back ? 1 : 0 } },
    side: back ? THREE.BackSide : THREE.FrontSide,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
  })
}

export function createPlateMaterial(uniforms: WorldUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: plateVertex, fragmentShader: plateFragment, uniforms })
}

export function createFloorMaterial(uniforms: WorldUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: plateVertex, fragmentShader: floorFragment, uniforms })
}
