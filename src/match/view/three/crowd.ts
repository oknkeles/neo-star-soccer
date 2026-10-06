/**
 * Crowd: thousands of billboard spectators in ONE draw call per stand. Each quad samples a
 * mask atlas (shirt / skin / hair channels) and is tinted per person, so the stands wear the
 * teams' colours. A vertex shader bobs them, raises arms with excitement and makes whole
 * sections jump on goals.
 */
import * as THREE from 'three';

export interface CrowdPerson {
  /** Base (feet) position in three coordinates. */
  x: number; y: number; z: number;
  shirt: THREE.Color;
  skin: THREE.Color;
  variant: number;   // 0..7
  phase: number;     // 0..1
  threshold: number; // 0..1, how easily he stands up
  section: 0 | 1;    // 0 = fans of "us", 1 = fans of "them"
  shade: number;     // brightness multiplier
}

const VERT = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec2 aCorner;
  attribute vec3 aRight;
  attribute vec3 aShirt;
  attribute vec3 aSkin;
  attribute vec4 aInfo;   // variant, phase, threshold, section
  attribute float aShade;
  uniform float uTime;
  uniform vec2 uExcite;   // us, them
  uniform vec2 uJump;
  uniform vec2 uSize;
  uniform float uWave;
  varying vec2 vUv;
  varying vec3 vShirt;
  varying vec3 vSkin;
  varying float vShade;
  #include <fog_pars_vertex>
  void main() {
    float ex = mix(uExcite.x, uExcite.y, aInfo.w);
    float jump = mix(uJump.x, uJump.y, aInfo.w);
    float ph = aInfo.y * 6.2831;
    // Mexican wave: a band of fans that stands up as it travels around the bowl.
    float ang = atan(aCenter.z, aCenter.x);
    float wave = uWave * smoothstep(0.82, 0.98, cos(ang - uTime * 0.9));
    float up = step(aInfo.z, ex * 0.75 + jump * 1.2 + wave * 1.3 + 0.02 * sin(uTime * 0.3 + ph));
    float bob = (0.015 + 0.07 * ex) * max(0.0, sin(uTime * (2.2 + aInfo.y * 1.6) + ph))
              + jump * 0.42 * max(0.0, sin(uTime * 7.5 + ph)) + wave * 0.35;
    float sway = sin(uTime * 1.3 + ph) * 0.03 * (0.3 + ex);
    vec3 pos = aCenter + aRight * (aCorner.x * uSize.x + sway) + vec3(0.0, aCorner.y * uSize.y + bob + up * 0.06, 0.0);
    vUv = vec2((aInfo.x + aCorner.x + 0.5) / 8.0, 1.0 - (up + (1.0 - aCorner.y)) * 0.5);
    vShirt = aShirt;
    vSkin = aSkin;
    vShade = aShade;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uLight;
  uniform float uFlash;
  varying vec2 vUv;
  varying vec3 vShirt;
  varying vec3 vSkin;
  varying float vShade;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    vec4 m = texture2D(uAtlas, vUv);
    if (m.a < 0.42) discard;
    float s = m.r + m.g + m.b + 1e-4;
    vec3 col = (m.r * vShirt + m.g * vSkin + m.b * vec3(0.045, 0.04, 0.045)) / s;
    col *= uLight * vShade;
    col += uFlash * 0.25 * vShirt;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export interface CrowdMesh {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  dispose(): void;
}

/** Shared material so all stands animate together. */
export function crowdMaterial(atlas: THREE.Texture, light: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uExcite: { value: new THREE.Vector2(0.2, 0.2) },
        uJump: { value: new THREE.Vector2(0, 0) },
        uSize: { value: new THREE.Vector2(0.62, 1.25) },
        uWave: { value: 0 },
        uLight: { value: light },
        uFlash: { value: 0 },
        uAtlas: { value: null },
      },
    ]),
  });
}

export function buildCrowdMesh(people: CrowdPerson[], right: THREE.Vector3, material: THREE.ShaderMaterial): CrowdMesh {
  const n = people.length;
  const center = new Float32Array(n * 4 * 3);
  const corner = new Float32Array(n * 4 * 2);
  const rightA = new Float32Array(n * 4 * 3);
  const shirt = new Float32Array(n * 4 * 3);
  const skin = new Float32Array(n * 4 * 3);
  const info = new Float32Array(n * 4 * 4);
  const shade = new Float32Array(n * 4);
  const index = new Uint32Array(n * 6);
  const corners = [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]];
  people.forEach((p, i) => {
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      center.set([p.x, p.y, p.z], v * 3);
      corner.set(corners[k], v * 2);
      rightA.set([right.x, right.y, right.z], v * 3);
      shirt.set([p.shirt.r, p.shirt.g, p.shirt.b], v * 3);
      skin.set([p.skin.r, p.skin.g, p.skin.b], v * 3);
      info.set([p.variant, p.phase, p.threshold, p.section], v * 4);
      shade[v] = p.shade;
    }
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  });
  const g = new THREE.BufferGeometry();
  // `position` is required by three; it carries the base centre (bounding volume is approximate).
  g.setAttribute('position', new THREE.BufferAttribute(center, 3));
  g.setAttribute('aCenter', new THREE.BufferAttribute(center, 3));
  g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  g.setAttribute('aRight', new THREE.BufferAttribute(rightA, 3));
  g.setAttribute('aShirt', new THREE.BufferAttribute(shirt, 3));
  g.setAttribute('aSkin', new THREE.BufferAttribute(skin, 3));
  g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  g.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius += 2;
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = true;
  return { mesh, material, dispose: () => g.dispose() };
}
