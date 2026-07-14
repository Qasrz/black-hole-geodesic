"use client";

import { useEffect, useRef, useState } from "react";

type SimulationSettings = {
  mass: number;
  inclination: number;
  exposure: number;
  fov: number;
  steps: number;
  diskBrightness: number;
  timeScale: number;
  paused: boolean;
};

const initialSettings: SimulationSettings = {
  mass: 1,
  inclination: 38,
  exposure: 1.05,
  fov: 1.08,
  steps: 360,
  diskBrightness: 1,
  timeScale: 0.75,
  paused: false,
};

const vertexShaderSource = `#version 300 es
in vec2 aPosition;
out vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uResolution;
uniform float uTime;
uniform float uMass;
uniform float uInclination;
uniform float uExposure;
uniform float uFov;
uniform float uDiskBrightness;
uniform int uSteps;

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;
const float CAMERA_RADIUS = 24.0;
const float ESCAPE_RADIUS = 72.0;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hash31(vec3 p) {
  p = fract(p * vec3(113.5, 271.9, 124.6));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

float starLayer(vec2 uv, float scale, float threshold, float radius) {
  vec2 grid = uv * scale;
  vec2 cell = floor(grid);
  vec2 local = fract(grid);
  float rnd = hash21(cell);
  vec2 point = vec2(hash21(cell + 7.1), hash21(cell + 19.7));
  float d = length(local - point);
  float core = smoothstep(radius, 0.0, d);
  return core * step(threshold, rnd) * pow(rnd, 14.0);
}

vec3 backgroundSky(vec3 d) {
  vec2 uv = vec2(atan(d.x, d.z) / TAU + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
  float bandShape = abs(d.y * 1.85 + 0.18 * sin(5.0 * d.x + 2.2 * d.z));
  float milkyBand = exp(-bandShape * bandShape * 8.0);
  float nebula = noise3(d * 4.0 + vec3(0.0, 0.0, uTime * 0.015));

  vec3 base = mix(vec3(0.006, 0.012, 0.028), vec3(0.034, 0.021, 0.066), smoothstep(-0.5, 0.85, d.y));
  vec3 dust = vec3(0.19, 0.09, 0.28) * milkyBand * (0.35 + 0.65 * nebula);
  vec3 blueGas = vec3(0.05, 0.14, 0.24) * pow(milkyBand, 2.0);

  float stars = 0.0;
  stars += starLayer(uv, 120.0, 0.965, 0.045);
  stars += starLayer(uv + 0.37, 260.0, 0.986, 0.04) * 1.4;
  stars += starLayer(uv + 0.61, 520.0, 0.994, 0.032) * 2.0;

  vec3 starColor = mix(vec3(0.75, 0.86, 1.0), vec3(1.0, 0.72, 0.48), hash21(floor(uv * 190.0)));
  return base + dust + blueGas + starColor * stars * 2.1;
}

vec3 geodesicDerivative(vec3 state, float angularMomentum, float mass) {
  float r = max(state.x, 2.02 * mass);
  float invR = 1.0 / r;
  float l2 = angularMomentum * angularMomentum;

  float radialAcceleration = l2 * invR * invR * invR - 3.0 * mass * l2 * invR * invR * invR * invR;
  float angularRate = angularMomentum * invR * invR;
  return vec3(state.y, radialAcceleration, angularRate);
}

vec3 rk4Step(vec3 state, float angularMomentum, float mass, float h) {
  vec3 k1 = geodesicDerivative(state, angularMomentum, mass);
  vec3 k2 = geodesicDerivative(state + 0.5 * h * k1, angularMomentum, mass);
  vec3 k3 = geodesicDerivative(state + 0.5 * h * k2, angularMomentum, mass);
  vec3 k4 = geodesicDerivative(state + h * k3, angularMomentum, mass);
  return state + (h / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
}

vec3 positionFromPlane(float r, float phi, vec3 eRadial, vec3 eTangent) {
  return r * (cos(phi) * eRadial + sin(phi) * eTangent);
}

vec3 diskEmission(vec3 hitPosition, vec3 rayStep, float mass) {
  float diskRadius = length(hitPosition.xz);
  float angle = atan(hitPosition.z, hitPosition.x);
  float inner = 3.05 * mass;
  float outer = 15.5 * mass;
  float radialMask = smoothstep(inner, inner + 0.65 * mass, diskRadius) * (1.0 - smoothstep(outer - 1.2 * mass, outer, diskRadius));

  vec3 tangent = normalize(vec3(-hitPosition.z, 0.0, hitPosition.x));
  vec3 toObserver = normalize(-rayStep);
  float orbitalSpeed = clamp(sqrt(mass / max(diskRadius, inner)), 0.0, 0.62);
  float doppler = pow(max(0.24, 1.0 + 1.65 * dot(tangent, toObserver) * orbitalSpeed), 2.55);
  float redshift = sqrt(max(0.03, 1.0 - 2.0 * mass / max(diskRadius, 2.05 * mass)));

  float rings = 0.56 + 0.44 * sin(18.0 * log(diskRadius + 0.2) - 3.8 * angle - uTime * 1.7);
  float turbulence = noise3(vec3(hitPosition.xz * 0.38, uTime * 0.22));
  float hotness = smoothstep(outer, inner, diskRadius);
  float brightness = radialMask * (0.22 + 0.78 * rings) * (0.65 + 0.55 * turbulence);
  brightness *= pow(inner / max(diskRadius, inner), 0.9) * doppler * redshift;

  vec3 ember = vec3(1.0, 0.24, 0.055);
  vec3 gold = vec3(1.0, 0.72, 0.22);
  vec3 whiteHot = vec3(1.0, 0.92, 0.68);
  vec3 color = mix(ember, gold, hotness);
  color = mix(color, whiteHot, smoothstep(0.62, 1.0, hotness) * 0.65);
  return color * brightness * uDiskBrightness;
}

void main() {
  vec2 centered = (gl_FragCoord.xy * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);
  float vignette = smoothstep(1.65, 0.28, length(centered));

  float mass = uMass;
  float cameraYaw = 0.18 * sin(uTime * 0.08);
  float inclination = radians(uInclination);
  vec3 eRadial = normalize(vec3(sin(cameraYaw) * cos(inclination), sin(inclination), cos(cameraYaw) * cos(inclination)));
  vec3 forward = -eRadial;
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(worldUp, forward));
  vec3 up = normalize(cross(forward, right));

  vec3 initialDirection = normalize(forward * 1.46 + right * centered.x * uFov + up * centered.y * uFov);
  float cosAlpha = clamp(dot(initialDirection, forward), 0.001, 1.0);
  vec3 transverse = initialDirection - forward * cosAlpha;
  float sinAlpha = length(transverse);
  vec3 eTangent = sinAlpha > 0.0001 ? normalize(transverse) : right;

  float lapse = sqrt(max(0.001, 1.0 - 2.0 * mass / CAMERA_RADIUS));
  float angularMomentum = CAMERA_RADIUS * sinAlpha / lapse;
  vec3 state = vec3(CAMERA_RADIUS, -cosAlpha, 0.0);

  vec3 previousPosition = positionFromPlane(state.x, state.z, eRadial, eTangent);
  vec3 diskColor = vec3(0.0);
  float diskAlpha = 0.0;
  float minRadius = CAMERA_RADIUS;
  float maxPhi = 0.0;
  bool captured = false;
  bool escaped = false;

  for (int i = 0; i < 520; i++) {
    if (i >= uSteps || captured || escaped) {
      break;
    }

    float adaptive = mix(0.026, 0.34, smoothstep(2.6 * mass, 18.0 * mass, state.x));
    vec3 nextState = rk4Step(state, angularMomentum, mass, adaptive);
    vec3 nextPosition = positionFromPlane(nextState.x, nextState.z, eRadial, eTangent);
    vec3 rayStep = nextPosition - previousPosition;

    if (diskAlpha < 0.94 && previousPosition.y * nextPosition.y <= 0.0) {
      float crossing = abs(previousPosition.y) / max(abs(previousPosition.y - nextPosition.y), 0.0001);
      vec3 hit = mix(previousPosition, nextPosition, clamp(crossing, 0.0, 1.0));
      float diskRadius = length(hit.xz);
      if (diskRadius > 3.02 * mass && diskRadius < 15.8 * mass) {
        vec3 emission = diskEmission(hit, rayStep, mass);
        float alpha = clamp(length(emission) * 0.21, 0.0, 0.78);
        diskColor += emission * (1.0 - diskAlpha);
        diskAlpha += alpha * (1.0 - diskAlpha);
      }
    }

    state = nextState;
    previousPosition = nextPosition;
    minRadius = min(minRadius, state.x);
    maxPhi = max(maxPhi, abs(state.z));

    if (state.x <= 2.012 * mass) {
      captured = true;
    }
    if (state.x > ESCAPE_RADIUS && state.y > 0.0) {
      escaped = true;
    }
  }

  vec3 finalDirection = normalize(cos(state.z) * eRadial + sin(state.z) * eTangent);
  vec3 color = backgroundSky(finalDirection);

  float photonSphere = 3.0 * mass;
  float photonProximity = exp(-abs(minRadius - photonSphere) / (0.18 * mass));
  float orbitBoost = smoothstep(1.25, 5.4, maxPhi);
  vec3 photonRing = vec3(1.0, 0.42, 0.12) * photonProximity * orbitBoost * 1.9;

  if (captured) {
    float rim = photonProximity * smoothstep(0.8, 3.9, maxPhi);
    color = vec3(0.0, 0.001, 0.004) + vec3(1.0, 0.34, 0.06) * rim * 0.65;
  } else {
    color = mix(color, diskColor + color * 0.22, diskAlpha);
    color += photonRing;
  }

  float chroma = 0.02 * photonProximity * orbitBoost;
  color.r += chroma;
  color.b += chroma * 0.35;
  color *= uExposure;
  color = vec3(1.0) - exp(-color);
  color = pow(color, vec3(0.86));
  color *= 0.72 + 0.28 * vignette;

  fragColor = vec4(color, 1.0);
}
`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Unable to create shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "Unknown shader compile error.";
    gl.deleteShader(shader);
    throw new Error(log);
  }

  return shader;
}

function createProgram(gl: WebGL2RenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Unable to create WebGL program.");
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);

  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "Unknown WebGL link error.";
    gl.deleteProgram(program);
    throw new Error(log);
  }

  return program;
}

function SimulationSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="control">
      <span>
        {label}
        <strong>
          {value.toFixed(step < 1 ? 2 : 0)}
          {unit}
        </strong>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function BlackHoleSimulation() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const settingsRef = useRef(initialSettings);
  const [settings, setSettings] = useState<SimulationSettings>(initialSettings);
  const [status, setStatus] = useState<"booting" | "running" | "fallback">(
    "booting",
  );

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      powerPreference: "high-performance",
    });

    if (!gl) {
      setStatus("fallback");
      return;
    }

    let program: WebGLProgram;

    try {
      program = createProgram(gl);
    } catch (error) {
      console.error(error);
      setStatus("fallback");
      return;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(program);

    const uniforms = {
      resolution: gl.getUniformLocation(program, "uResolution"),
      time: gl.getUniformLocation(program, "uTime"),
      mass: gl.getUniformLocation(program, "uMass"),
      inclination: gl.getUniformLocation(program, "uInclination"),
      exposure: gl.getUniformLocation(program, "uExposure"),
      fov: gl.getUniformLocation(program, "uFov"),
      steps: gl.getUniformLocation(program, "uSteps"),
      diskBrightness: gl.getUniformLocation(program, "uDiskBrightness"),
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.65);
      const width = Math.max(320, Math.floor(bounds.width * pixelRatio));
      const height = Math.max(260, Math.floor(bounds.height * pixelRatio));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const render = (timestamp: number) => {
      const current = settingsRef.current;

      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = current.paused
        ? 0
        : ((timestamp - startTimeRef.current) / 1000) * current.timeScale;

      resize();
      gl.useProgram(program);
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.time, elapsed);
      gl.uniform1f(uniforms.mass, current.mass);
      gl.uniform1f(uniforms.inclination, current.inclination);
      gl.uniform1f(uniforms.exposure, current.exposure);
      gl.uniform1f(uniforms.fov, current.fov);
      gl.uniform1f(uniforms.diskBrightness, current.diskBrightness);
      gl.uniform1i(uniforms.steps, current.steps);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      setStatus((previous) => (previous === "running" ? previous : "running"));
      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      observer.disconnect();

      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }

      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, []);

  const updateSetting = <Key extends keyof SimulationSettings>(
    key: Key,
    value: SimulationSettings[Key],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const reset = () => setSettings(initialSettings);

  return (
    <section className="simulation-panel" aria-label="Black hole simulation">
      <div className="viewport-card">
        <div className="viewport-toolbar">
          <div>
            <span className={`status-dot status-dot--${status}`} />
            <span>
              {status === "running"
                ? "Tracing null geodesics"
                : status === "fallback"
                  ? "WebGL2 unavailable"
                  : "Compiling shader kernel"}
            </span>
          </div>
          <code>Schwarzschild · RK4 · λ-step adaptive</code>
        </div>
        <div className="canvas-wrap">
          <canvas ref={canvasRef} aria-label="Rendered black hole simulation" />
          {status === "fallback" ? (
            <div className="fallback-message">
              <strong>WebGL2 is required for the live simulation.</strong>
              <span>
                The physics kernel is still included in the project; try a
                browser or device with WebGL2 enabled.
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <aside className="control-panel">
        <div className="control-panel__header">
          <p>Controls</p>
          <button type="button" onClick={reset}>
            Reset
          </button>
        </div>

        <SimulationSlider
          label="Mass scale"
          min={0.72}
          max={1.7}
          step={0.01}
          value={settings.mass}
          onChange={(value) => updateSetting("mass", value)}
          unit=" M"
        />
        <SimulationSlider
          label="Camera inclination"
          min={8}
          max={72}
          step={1}
          value={settings.inclination}
          onChange={(value) => updateSetting("inclination", value)}
          unit="°"
        />
        <SimulationSlider
          label="Field of view"
          min={0.82}
          max={1.44}
          step={0.01}
          value={settings.fov}
          onChange={(value) => updateSetting("fov", value)}
        />
        <SimulationSlider
          label="Exposure"
          min={0.55}
          max={1.85}
          step={0.01}
          value={settings.exposure}
          onChange={(value) => updateSetting("exposure", value)}
        />
        <SimulationSlider
          label="Disk brightness"
          min={0.2}
          max={1.75}
          step={0.01}
          value={settings.diskBrightness}
          onChange={(value) => updateSetting("diskBrightness", value)}
        />
        <SimulationSlider
          label="Integration steps"
          min={180}
          max={520}
          step={10}
          value={settings.steps}
          onChange={(value) => updateSetting("steps", value)}
        />
        <SimulationSlider
          label="Animation speed"
          min={0}
          max={1.6}
          step={0.01}
          value={settings.timeScale}
          onChange={(value) => updateSetting("timeScale", value)}
        />

        <button
          className="pause-button"
          type="button"
          onClick={() => updateSetting("paused", !settings.paused)}
        >
          {settings.paused ? "Resume motion" : "Pause motion"}
        </button>

        <div className="equation-card">
          <span>Kernel equation</span>
          <code>(dr/dλ)² = E² − (1 − 2M/r)L²/r²</code>
          <p>
            The shader integrates the equivalent second-order form per pixel and
            marks a ray captured when r crosses 2M.
          </p>
        </div>
      </aside>
    </section>
  );
}
