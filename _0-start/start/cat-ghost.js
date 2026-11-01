import * as THREE from 'three';

const ease = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

// A short, bounded effect. The imported lucky-cat texture stays readable;
// particles own no lights and cannot illuminate the powered-off cabinet.
export function createCatGhost({ cat, parent, materials, baseY, height, own }) {
    const rest = cat.position.clone();
    const worldToCat = { value: new THREE.Matrix4() };
    const dissolve = { value: 0 };
    const emergence = { value: 0 };
    const localFloor = { value: baseY };
    const floorY = rest.y + baseY * cat.scale.y;
    const worldHeight = height * cat.scale.y;
    const time = { value: 0 };
    for(const material of materials) {
        material.color.multiply(new THREE.Color(0xd9fff3));
        material.depthWrite = false;
        material.side = THREE.FrontSide;
        material.onBeforeCompile = shader => {
            shader.uniforms.ghostFromWorld = worldToCat;
            shader.uniforms.ghostDissolve = dissolve;
            shader.uniforms.ghostTime = time;
            shader.uniforms.ghostEmergence = emergence;
            shader.uniforms.ghostFloor = localFloor;
            shader.vertexShader = `uniform mat4 ghostFromWorld; varying vec3 vGhostLocal; varying float vGhostRim;\n` + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
                vGhostLocal = (ghostFromWorld * modelMatrix * vec4(transformed, 1.0)).xyz;
                vGhostRim = pow(1.0 - abs(dot(normalize(mat3(modelViewMatrix) * normal), normalize(-mvPosition.xyz))), 2.0);`);
            shader.fragmentShader = `uniform float ghostDissolve; uniform float ghostTime;
                uniform float ghostEmergence; uniform float ghostFloor;
                varying vec3 vGhostLocal; varying float vGhostRim;
                float ghostHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
                float ghostNoise(vec3 p) {
                    vec3 cell = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
                    return mix(mix(mix(ghostHash(cell), ghostHash(cell+vec3(1,0,0)), f.x),
                                   mix(ghostHash(cell+vec3(0,1,0)), ghostHash(cell+vec3(1,1,0)), f.x), f.y),
                               mix(mix(ghostHash(cell+vec3(0,0,1)), ghostHash(cell+vec3(1,0,1)), f.x),
                                   mix(ghostHash(cell+vec3(0,1,1)), ghostHash(cell+vec3(1,1,1)), f.x), f.y), f.z);
                }\n` + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
                float grey = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(grey), .32);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.48, .88, .79), .18);
                float ghostHeight = (vGhostLocal.y - ${baseY.toFixed(8)}) / ${height.toFixed(8)};
                float mist = ghostNoise(vGhostLocal * 55.0 + vec3(0.0, ghostTime * .4, 0.0));
                float field = ghostHeight + mist * .18;
                float threshold = ghostDissolve * 1.45 - .24;
                float remaining = smoothstep(threshold, threshold + .08, field);
                float edge = (1.0 - smoothstep(threshold + .06, threshold + .15, field)) * remaining * step(.01, ghostDissolve);
                float floorField = (vGhostLocal.y - ghostFloor) / ${height.toFixed(8)} + (mist - .5) * .10 * ghostEmergence;
                float aboveFloor = smoothstep(-.004, .004 + .04 * ghostEmergence, floorField);
                float floorClip = step(.001, ghostEmergence);
                remaining *= mix(1.0, aboveFloor, floorClip);
                edge = max(edge, (1.0 - smoothstep(.03, .12, floorField)) * aboveFloor * ghostEmergence);
                diffuseColor.rgb += vec3(.13,.35,.32) * vGhostRim + vec3(.35,.75,.65) * edge;
                diffuseColor.a *= remaining * (.76 + .24 * vGhostRim);
                if(diffuseColor.a < .012) discard;`);
        };
        material.customProgramCacheKey = () => 'start-lucky-cat-ghost-v2';
    }
    const count = 240;
    const positions = new Float32Array(count * 3), alphas = new Float32Array(count), sizes = new Float32Array(count);
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    let seed = 1867;
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    const particles = Array.from({ length: count }, (_, i) => {
        sizes[i] = .003 + random() * .006;
        return { birth: random(), life: .5 + random() * .6, x: (random() - .5) * .42,
            y: random() * .57, z: (random() - .5) * .32, curl: random() * Math.PI * 2 };
    });
    const material = own(new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { viewport: { value: 900 } },
        vertexShader: `attribute float alpha; attribute float size; uniform float viewport;
            varying float vAlpha;
            void main() { vec4 view = modelViewMatrix * vec4(position, 1.0); vAlpha = alpha;
                gl_Position = projectionMatrix * view;
                gl_PointSize = clamp(size * viewport * projectionMatrix[1][1] / max(.01, -view.z), 1.0, 36.0); }`,
        fragmentShader: `varying float vAlpha;
            void main() { float r = length(gl_PointCoord - .5) * 2.0;
                float mist = exp(-r * r * 4.5) * (1.0 - smoothstep(.35, 1.0, r));
                gl_FragColor = vec4(mix(vec3(.40,.68,1.0), vec3(.68,1.0,.86), gl_PointCoord.y), mist * vAlpha); }`
    }));
    const points = new THREE.Points(geometry, material);
    points.name = 'start-cat-ghost-wisps'; points.frustumCulled = false;
    parent.add(points); points.visible = false;
    let activeParticles = 0;
    const poseAt = (t, arrival, departure, end, out) => {
        out.copy(rest);
        if(t < arrival) {
            const p = ease((t - .15) / (arrival - .15));
            // Approach on the switch's straight axis, rising from fully below
            // the shared table plane. No lateral offset or sideways bend.
            out.z -= 4.0 * (1 - p);
            out.y -= (worldHeight + .025) * (1 - p);
        } else if(t > departure) out.y += .32 * ease((t - departure) / (end - departure));
        return out;
    };
    const source = new THREE.Vector3();
    function update(t, { arrival, departure, end }) {
        poseAt(t, arrival, departure, end, cat.position);
        dissolve.value = ease((t - departure) / (end - departure));
        emergence.value = t < arrival ? 1 - ease((t - .15) / (arrival - .15)) : 0;
        localFloor.value = (floorY - cat.position.y) / cat.scale.y;
        time.value = t;
        cat.updateWorldMatrix(true, false);
        worldToCat.value.copy(cat.matrixWorld).invert();
        material.uniforms.viewport.value = window.innerHeight * Math.min(window.devicePixelRatio || 1, 2);
        activeParticles = 0;
        for(let i = 0; i < count; i++) {
            const particle = particles[i];
            const birth = .15 + particle.birth * (end - .45);
            const life = Math.min(particle.life, end - birth);
            const age = t - birth;
            if(age < 0 || age > life) { alphas[i] = 0; continue; }
            const progress = age / life;
            poseAt(birth, arrival, departure, end, source);
            positions[i * 3] = source.x + particle.x + Math.sin(particle.curl + age * 3) * age * .035;
            positions[i * 3 + 1] = source.y + particle.y + age * (.10 + dissolve.value * .20);
            positions[i * 3 + 2] = source.z + particle.z + Math.cos(particle.curl + age * 2) * age * .03;
            if(positions[i * 3 + 1] < floorY) { alphas[i] = 0; continue; }
            alphas[i] = Math.sin(Math.PI * progress) * .72;
            activeParticles++;
        }
        points.visible = activeParticles > 0;
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.alpha.needsUpdate = true;
    }
    function reset() {
        cat.position.copy(rest); dissolve.value = 0; emergence.value = 0; localFloor.value = baseY; time.value = 0;
        cat.updateWorldMatrix(true, false); worldToCat.value.copy(cat.matrixWorld).invert();
        points.visible = false; activeParticles = 0;
    }
    function inspect() { return { particles: activeParticles, dissolve: dissolve.value, emergence: emergence.value,
        floorY, position: cat.position.toArray(), rest: rest.toArray() }; }
    reset();
    return { update, reset, inspect, dispose: () => points.removeFromParent() };
}
