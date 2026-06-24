import * as THREE from 'three'

/* Custom liquid-glass shader. A single fullscreen quad renders flowing refractive
   glass: domain-warped fbm height field → surface normal → chromatic refraction of
   a theme-tinted gradient, plus caustic ridges and a fresnel rim. The `uCloud`
   uniform frosts the glass — the visual enactment of "confidently wrong vs. clear".
   uTheme lerps 0 (dark) → 1 (light). */

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uTheme;   // 0 dark .. 1 light
  uniform float uCloud;   // 0 clear .. 1 frosted
  uniform vec2  uResolution;

  // --- Ashima 2D simplex noise ---
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
  float snoise(vec2 v){
    const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
    vec2 i=floor(v+dot(v,C.yy));
    vec2 x0=v-i+dot(i,C.xx);
    vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
    vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;
    i=mod289(i);
    vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
    vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
    m=m*m; m=m*m;
    vec3 x=2.0*fract(p*C.www)-1.0;
    vec3 h=abs(x)-0.5;
    vec3 ox=floor(x+0.5);
    vec3 a0=x-ox;
    m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
    vec3 g;
    g.x=a0.x*x0.x+h.x*x0.y;
    g.yz=a0.yz*x12.xz+h.yz*x12.yw;
    return 130.0*dot(m,g);
  }
  float fbm(vec2 p){
    float a=0.5, s=0.0;
    for(int i=0;i<5;i++){ s+=a*snoise(p); p*=2.02; a*=0.5; }
    return s;
  }

  void main(){
    vec2 uv = vUv;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 p = (uv - 0.5); p.x *= aspect;

    float t = uTime * 0.05;
    // domain warp for the flowing-glass feel
    vec2 q = vec2(fbm(p*1.6 + vec2(t, -t)), fbm(p*1.6 + vec2(-t, t) + 5.2));
    float h = fbm(p*1.8 + q*1.4 + t);
    float e = 0.0022;
    float hx = fbm((p+vec2(e,0.0))*1.8 + q*1.4 + t) - fbm((p-vec2(e,0.0))*1.8 + q*1.4 + t);
    float hy = fbm((p+vec2(0.0,e))*1.8 + q*1.4 + t) - fbm((p-vec2(0.0,e))*1.8 + q*1.4 + t);
    vec3 n = normalize(vec3(-hx, -hy, 0.06));

    // theme palettes
    vec3 darkA = vec3(0.039,0.051,0.075);
    vec3 darkB = vec3(0.078,0.115,0.176);
    vec3 darkAcc = vec3(0.34,0.78,0.89);
    vec3 lightA = vec3(0.90,0.93,0.975);
    vec3 lightB = vec3(0.77,0.83,0.92);
    vec3 lightAcc = vec3(0.08,0.53,0.68);
    vec3 baseA = mix(darkA, lightA, uTheme);
    vec3 baseB = mix(darkB, lightB, uTheme);
    vec3 accent = mix(darkAcc, lightAcc, uTheme);

    // refracted gradient (chromatic split along the surface normal)
    vec2 ro = n.xy * 0.28;
    vec3 col;
    col.r = mix(baseA.r, baseB.r, clamp(uv.y + ro.x + ro.y, 0.0, 1.0));
    col.g = mix(baseA.g, baseB.g, clamp(uv.y + ro.x,        0.0, 1.0));
    col.b = mix(baseA.b, baseB.b, clamp(uv.y - ro.x,        0.0, 1.0));

    // caustic ridges
    float caustic = pow(clamp(1.0 - abs(h)*1.6, 0.0, 1.0), 3.0);
    col += accent * caustic * (0.16 + 0.12*uTheme);

    // fresnel rim
    float fres = pow(1.0 - n.z, 2.0);
    col += accent * fres * 0.10;

    // cloudiness frosts the glass
    float lum = dot(col, vec3(0.299,0.587,0.114));
    vec3 frost = mix(col, vec3(lum), 0.6) + (uTheme > 0.5 ? 0.04 : 0.015);
    col = mix(col, frost, clamp(uCloud, 0.0, 1.0) * 0.7);

    // grain + vignette
    col += snoise(p*180.0) * 0.012;
    float vig = smoothstep(1.25, 0.18, length(uv - 0.5));
    col *= mix(0.80, 1.0, vig);

    gl_FragColor = vec4(col, 1.0);
  }
`

export function createGlassMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      uTime: { value: 0 },
      uTheme: { value: 0 },
      uCloud: { value: 0.5 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
    depthWrite: false,
    depthTest: false,
  })
}
