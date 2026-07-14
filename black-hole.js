const vertexShaderSource = `
attribute vec2 aPosition;

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const fragmentShaderSource = `
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uMass;
uniform float uInclination;
uniform float uExposure;
uniform float uFov;
uniform float uDiskBrightness;
uniform float uCameraRadius;
uniform float uAccretionRate;
uniform float uAlphaViscosity;
uniform float uYaw;
uniform vec2 uPan;
uniform int uSteps;

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

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
  float bandShape = abs(d.y * 2.25 + 0.09 * sin(4.4 * d.x + 1.7 * d.z));
  float galacticDust = exp(-bandShape * bandShape * 7.5);
  float cloud = noise3(d * 3.2 + vec3(0.0, 0.0, uTime * 0.006));

  vec3 base = mix(vec3(0.0018, 0.0026, 0.006), vec3(0.010, 0.012, 0.022), smoothstep(-0.55, 0.9, d.y));
  vec3 dust = vec3(0.035, 0.030, 0.042) * galacticDust * (0.34 + 0.66 * cloud);
  vec3 coldGas = vec3(0.010, 0.018, 0.030) * pow(galacticDust, 2.2);

  float stars = 0.0;
  stars += starLayer(uv, 130.0, 0.972, 0.036);
  stars += starLayer(uv + 0.37, 285.0, 0.990, 0.03) * 1.15;
  stars += starLayer(uv + 0.61, 570.0, 0.996, 0.024) * 1.55;

  vec3 starColor = mix(vec3(0.72, 0.80, 0.94), vec3(1.0, 0.86, 0.64), hash21(floor(uv * 190.0)));
  return base + dust + coldGas + starColor * stars * 1.35;
}

vec3 geodesicDerivative(vec3 state, float mass) {
  float u = max(state.x, 0.0);
  return vec3(state.y, 3.0 * mass * u * u - u, 1.0);
}

vec3 rk4Step(vec3 state, float mass, float h) {
  vec3 k1 = geodesicDerivative(state, mass);
  vec3 k2 = geodesicDerivative(state + 0.5 * h * k1, mass);
  vec3 k3 = geodesicDerivative(state + 0.5 * h * k2, mass);
  vec3 k4 = geodesicDerivative(state + h * k3, mass);
  return state + (h / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
}

float radiusFromU(float u) {
  return 1.0 / max(u, 0.000001);
}

vec3 positionFromPlane(float r, float phi, vec3 eRadial, vec3 eTangent) {
  return r * (cos(phi) * eRadial + sin(phi) * eTangent);
}

float schwarzschildOmega(float radius, float mass) {
  return sqrt(mass / max(radius * radius * radius, 0.000001));
}

float orbitalVelocity(float radius, float mass) {
  return clamp(sqrt(mass / max(radius - 2.0 * mass, 0.35 * mass)), 0.0, 0.72);
}

float thinDiskFlux(float radius, float isco, float mass, float accretionRate) {
  float x = max(radius / isco, 1.0001);
  float noTorque = max(0.0, 1.0 - sqrt(1.0 / x));
  return (3.0 * mass * accretionRate / (8.0 * PI * pow(max(radius, isco), 3.0))) * noTorque;
}

vec3 diskBlackbodyColor(float heat) {
  vec3 dimRed = vec3(0.26, 0.075, 0.025);
  vec3 amber = vec3(0.95, 0.54, 0.24);
  vec3 warmWhite = vec3(1.0, 0.88, 0.66);
  vec3 whiteHot = vec3(0.95, 0.96, 0.92);
  vec3 color = mix(dimRed, amber, smoothstep(0.08, 0.44, heat));
  color = mix(color, warmWhite, smoothstep(0.38, 0.78, heat));
  color = mix(color, whiteHot, smoothstep(0.78, 1.0, heat));
  return color;
}

vec3 diskEmission(vec3 hitPosition, vec3 rayStep, float mass) {
  float diskRadius = length(hitPosition.xz);
  float angle = atan(hitPosition.z, hitPosition.x);
  float isco = 6.0 * mass;
  float outer = 34.0 * mass;
  float radialMask = smoothstep(isco, isco + 0.42 * mass, diskRadius) * (1.0 - smoothstep(outer - 5.0 * mass, outer, diskRadius));
  float accretionRate = max(uAccretionRate, 0.01);
  float alpha = clamp(uAlphaViscosity, 0.01, 0.75);

  vec3 tangent = normalize(vec3(-hitPosition.z, 0.0, hitPosition.x));
  vec3 toObserver = normalize(-rayStep);
  float losVelocity = dot(tangent, toObserver);

  float omega = schwarzschildOmega(diskRadius, mass);
  float orbitalSpeed = orbitalVelocity(diskRadius, mass);
  float gamma = 1.0 / sqrt(max(0.08, 1.0 - orbitalSpeed * orbitalSpeed));
  float doppler = 1.0 / max(0.16, gamma * (1.0 - orbitalSpeed * losVelocity));
  float gravitational = sqrt(max(0.018, 1.0 - 2.0 * mass / max(diskRadius, 2.05 * mass)));
  float observedShift = clamp(gravitational * doppler, 0.05, 2.4);

  float aspectRatio = clamp(0.038 * pow(accretionRate, 0.18) * pow(max(diskRadius / isco, 1.0), 0.08) * pow(alpha / 0.22, -0.03), 0.018, 0.12);
  float soundSpeed = aspectRatio * orbitalSpeed;
  float scaleHeight = aspectRatio * diskRadius;
  float viscosity = alpha * soundSpeed * scaleHeight;
  float noTorque = max(0.025, 1.0 - sqrt(isco / max(diskRadius, isco + 0.001)));
  float surfaceDensity = accretionRate / max(3.0 * PI * viscosity * noTorque, 0.00001);
  float opticalDepth = 1.0 - exp(-clamp(surfaceDensity * 0.072, 0.0, 9.0));

  float flux = thinDiskFlux(diskRadius, isco, mass, accretionRate);
  float normalizedFlux = flux * 145000.0;
  float heat = clamp(pow(max(normalizedFlux, 0.0), 0.25) * observedShift, 0.0, 1.0);

  float orbitalPhase = angle - omega * uTime * 34.0;
  float eddyScale = clamp(diskRadius / max(scaleHeight * 2.6, 0.001), 4.0, 34.0);
  vec2 eddyPlane = vec2(cos(orbitalPhase), sin(orbitalPhase)) * eddyScale;
  float eddyA = noise3(vec3(eddyPlane, log(max(diskRadius / isco, 1.0)) * 2.7 + uTime * alpha * 0.5));
  float eddyB = noise3(vec3(eddyPlane * 2.15 + 8.0, log(max(diskRadius, 0.1)) * 4.2 - uTime * 0.18));
  float turbulentMach = clamp(sqrt(alpha) * 0.62, 0.06, 0.58);
  float densityPerturbation = 1.0 + turbulentMach * (0.26 * (eddyA - 0.5) + 0.12 * (eddyB - 0.5));
  float shearTexture = 1.0 + turbulentMach * 0.05 * sin(2.0 * orbitalPhase - 7.0 * log(max(diskRadius / isco, 1.0)));
  float turbulence = clamp(densityPerturbation * shearTexture, 0.68, 1.34);
  float beaming = pow(observedShift, 3.35);
  float limbSoftening = mix(0.72, 1.0, smoothstep(0.05, 0.42, abs(toObserver.y)));
  float blazeBoost = mix(1.55, 2.85, smoothstep(0.35, 1.6, accretionRate));
  float brightness = radialMask * normalizedFlux * beaming * turbulence * limbSoftening * opticalDepth * blazeBoost;

  vec3 color = diskBlackbodyColor(heat);
  return color * brightness * uDiskBrightness;
}

void main() {
  vec2 centered = (gl_FragCoord.xy * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);
  centered += uPan;
  float vignette = smoothstep(1.65, 0.28, length(centered));

  float mass = uMass;
  float cameraRadius = max(uCameraRadius, 2.8 * mass + 0.35);
  float escapeRadius = max(64.0, cameraRadius * 3.2);
  float cameraYaw = uYaw + 0.035 * sin(uTime * 0.08);
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

  float lapse = sqrt(max(0.001, 1.0 - 2.0 * mass / cameraRadius));
  float impactParameter = cameraRadius * max(sinAlpha, 0.00045) / lapse;
  float u0 = 1.0 / cameraRadius;
  float radialPotential = max(0.0, 1.0 / (impactParameter * impactParameter) - u0 * u0 + 2.0 * mass * u0 * u0 * u0);
  vec3 state = vec3(u0, sqrt(radialPotential), 0.0);

  vec3 previousPosition = positionFromPlane(cameraRadius, state.z, eRadial, eTangent);
  vec3 diskColor = vec3(0.0);
  float diskAlpha = 0.0;
  float minRadius = cameraRadius;
  float maxPhi = 0.0;
  bool captured = false;
  bool escaped = false;

  for (int i = 0; i < 520; i++) {
    if (i >= uSteps || captured || escaped) {
      break;
    }

    float radius = radiusFromU(state.x);
    float adaptive = mix(0.0045, 0.032, smoothstep(2.35 * mass, 42.0 * mass, radius));
    adaptive *= mix(0.68, 1.0, smoothstep(0.0, 0.22, sinAlpha));
    vec3 nextState = rk4Step(state, mass, adaptive);
    float nextRadius = radiusFromU(nextState.x);
    vec3 nextPosition = positionFromPlane(nextRadius, nextState.z, eRadial, eTangent);
    vec3 rayStep = nextPosition - previousPosition;

    if (diskAlpha < 0.94 && previousPosition.y * nextPosition.y <= 0.0) {
      float crossing = abs(previousPosition.y) / max(abs(previousPosition.y - nextPosition.y), 0.0001);
      vec3 hit = mix(previousPosition, nextPosition, clamp(crossing, 0.0, 1.0));
      float diskRadius = length(hit.xz);
      if (diskRadius > 5.98 * mass && diskRadius < 34.4 * mass) {
        vec3 emission = diskEmission(hit, rayStep, mass);
        float alpha = clamp(length(emission) * 0.24, 0.0, 0.84);
        diskColor += emission * (1.0 - diskAlpha);
        diskAlpha += alpha * (1.0 - diskAlpha);
      }
    }

    state = nextState;
    previousPosition = nextPosition;
    minRadius = min(minRadius, nextRadius);
    maxPhi = max(maxPhi, abs(state.z));

    if (state.x >= 1.0 / (2.012 * mass)) {
      captured = true;
    }
    if ((state.x <= 0.0 || nextRadius > escapeRadius) && state.y < 0.0 && state.z > 0.05) {
      escaped = true;
    }
  }

  vec3 finalDirection = normalize(cos(state.z) * eRadial + sin(state.z) * eTangent);
  vec3 color = backgroundSky(finalDirection);

  float photonSphere = 3.0 * mass;
  float photonProximity = exp(-abs(minRadius - photonSphere) / (0.18 * mass));
  float orbitBoost = smoothstep(1.25, 5.4, maxPhi);
  vec3 photonRing = vec3(1.0, 0.68, 0.32) * photonProximity * orbitBoost * 1.18;

  if (captured) {
    float rim = photonProximity * smoothstep(0.8, 3.9, maxPhi);
    color = vec3(0.0, 0.0006, 0.002) + vec3(0.84, 0.45, 0.18) * rim * 0.26;
  } else {
    vec3 diskBloom = diskColor * diskColor * 0.18;
    color = mix(color, diskColor * 1.18 + diskBloom + color * 0.07, diskAlpha);
    color += photonRing + diskBloom * diskAlpha * 0.34;
  }

  float chroma = 0.006 * photonProximity * orbitBoost;
  color.r += chroma;
  color.b += chroma * 0.22;
  color *= uExposure;
  color = vec3(1.0) - exp(-color);
  color = pow(color, vec3(0.92));
  color *= 0.66 + 0.34 * vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;

const initialSettings = {
  mass: 1,
  inclination: 38,
  cameraRadius: 24,
  exposure: 1.28,
  fov: 1.08,
  steps: 420,
  diskBrightness: 1.35,
  accretionRate: 0.82,
  alphaViscosity: 0.3,
  timeScale: 0.68,
  yaw: 0,
  panX: 0,
  panY: 0,
  paused: false,
};

const settings = { ...initialSettings };
const controlInputs = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function updateControlOutput(input) {
  const value = Number(input.value);
  const precision = Number(input.dataset.precision || "2");
  const unit = input.dataset.unit || "";
  const output = document.querySelector(`#${input.dataset.value}`);

  if (output) {
    output.textContent = `${value.toFixed(precision)}${unit}`;
  }
}

function syncControl(key) {
  const input = controlInputs.get(key);

  if (!input) {
    return;
  }

  input.value = String(settings[key]);
  updateControlOutput(input);
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Unable to create shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "Unknown shader compile error.";
    gl.deleteShader(shader);
    throw new Error(log);
  }

  return shader;
}

function createProgram(gl) {
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
    const log = gl.getProgramInfoLog(program) || "Unknown WebGL link error.";
    gl.deleteProgram(program);
    throw new Error(log);
  }

  return program;
}

function updateStatus(state, message) {
  const dot = document.querySelector("#status-dot");
  const label = document.querySelector("#status-label");

  if (!dot || !label) {
    return;
  }

  dot.className = `status-dot status-dot--${state}`;
  label.textContent = message;
}

function showFallback(message) {
  updateStatus("fallback", message);
}

function bindTabs() {
  const tabs = [...document.querySelectorAll("[data-tab]")];
  const panels = [...document.querySelectorAll("[data-panel]")];

  const activate = (target) => {
    tabs.forEach((tab) => {
      const isActive = tab.dataset.tab === target;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });

    panels.forEach((panel) => {
      const isActive = panel.dataset.panel === target;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activate(tab.dataset.tab));
  });
}

function bindUiToggle() {
  const toggle = document.querySelector("#ui-toggle");
  const dock = document.querySelector("#tab-dock");

  if (!toggle || !dock) {
    return;
  }

  const label = toggle.querySelector(".ui-toggle__label");

  const setOpen = (open) => {
    dock.classList.toggle("is-open", open);
    dock.setAttribute("aria-hidden", String(!open));
    toggle.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));

    if (label) {
      label.textContent = open ? "Close controls" : "Controls";
    }
  };

  setOpen(false);
  toggle.addEventListener("click", () => {
    setOpen(!dock.classList.contains("is-open"));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setOpen(false);
    }
  });
}

function bindControls() {
  document.querySelectorAll("[data-control]").forEach((input) => {
    const updateValue = () => {
      const key = input.dataset.control;
      const value = Number(input.value);

      settings[key] = value;
      updateControlOutput(input);
    };

    controlInputs.set(input.dataset.control, input);
    input.addEventListener("input", updateValue);
    updateValue();
  });

  document.querySelector("#reset-button").addEventListener("click", () => {
    Object.assign(settings, initialSettings);

    document.querySelectorAll("[data-control]").forEach((input) => {
      input.value = String(settings[input.dataset.control]);
      input.dispatchEvent(new Event("input"));
    });

    settings.yaw = initialSettings.yaw;
    settings.panX = initialSettings.panX;
    settings.panY = initialSettings.panY;
    settings.paused = false;
    document.querySelector("#pause-button").textContent = "Pause motion";
  });

  document.querySelector("#pause-button").addEventListener("click", (event) => {
    settings.paused = !settings.paused;
    event.currentTarget.textContent = settings.paused
      ? "Resume motion"
      : "Pause motion";
  });
}

function bindPointerControls(canvas) {
  if (!canvas) {
    return;
  }

  const experience = document.querySelector(".experience");
  const drag = {
    mode: null,
    pointerId: null,
    x: 0,
    y: 0,
    yaw: 0,
    inclination: 0,
    panX: 0,
    panY: 0,
  };

  const endDrag = (event) => {
    if (drag.pointerId !== null && event?.pointerId === drag.pointerId) {
      try {
        if (!canvas.hasPointerCapture || canvas.hasPointerCapture(drag.pointerId)) {
          canvas.releasePointerCapture?.(drag.pointerId);
        }
      } catch (error) {
        console.warn("Pointer capture release skipped.", error);
      }
    }

    drag.mode = null;
    drag.pointerId = null;
    experience?.classList.remove("is-dragging");
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.button !== 1) {
      return;
    }

    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);

    drag.mode = event.button === 1 ? "pan" : "orbit";
    drag.pointerId = event.pointerId;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.yaw = settings.yaw;
    drag.inclination = settings.inclination;
    drag.panX = settings.panX;
    drag.panY = settings.panY;
    experience?.classList.add("is-dragging");
  });

  canvas.addEventListener("pointermove", (event) => {
    if (drag.pointerId !== event.pointerId || drag.mode === null) {
      return;
    }

    event.preventDefault();
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;

    if (drag.mode === "orbit") {
      settings.yaw = drag.yaw + dx * 0.006;
      settings.inclination = clamp(drag.inclination - dy * 0.12, 5, 84);
      syncControl("inclination");
      return;
    }

    const panScale = 2.35 / Math.max(320, Math.min(window.innerWidth, window.innerHeight));
    settings.panX = clamp(drag.panX - dx * panScale, -1.85, 1.85);
    settings.panY = clamp(drag.panY + dy * panScale, -1.45, 1.45);
  });

  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("lostpointercapture", endDrag);

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const zoomStep = event.deltaY * 0.018;
      settings.cameraRadius = clamp(settings.cameraRadius + zoomStep, 8.5, 54);
      syncControl("cameraRadius");
    },
    { passive: false },
  );

  canvas.addEventListener("auxclick", (event) => {
    if (event.button === 1) {
      event.preventDefault();
    }
  });
}

function bootCanvasFallback(canvas) {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    showFallback("Canvas unavailable");
    return;
  }

  showFallback("Canvas fallback active");

  const stars = Array.from({ length: 420 }, (_, index) => ({
    x: Math.random(),
    y: Math.random(),
    radius: 0.35 + Math.random() * 1.25,
    glow: 0.35 + Math.random() * 0.65,
    drift: (index % 7) * 0.0007 + 0.0005,
  }));

  const resize = () => {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.7);
    const width = Math.floor(window.innerWidth * pixelRatio);
    const height = Math.floor(window.innerHeight * pixelRatio);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }
  };

  let lastTimestamp = null;
  let simulationTime = 0;

  const render = (timestamp) => {
    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    }

    const delta = Math.min(80, timestamp - lastTimestamp);
    lastTimestamp = timestamp;

    if (!settings.paused) {
      simulationTime += (delta / 1000) * settings.timeScale;
    }

    resize();

    const width = window.innerWidth;
    const height = window.innerHeight;
    const scale = Math.min(width, height);
    const zoom = Math.pow(24 / settings.cameraRadius, 0.82);
    const cx = width * (0.52 - settings.panX * 0.22);
    const cy = height * (0.5 + settings.panY * 0.22);
    const horizon = scale * 0.12 * settings.mass * zoom;
    const ring = horizon * 1.18;

    const background = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 0.9);
    background.addColorStop(0, "#000003");
    background.addColorStop(0.38, "#01030a");
    background.addColorStop(0.72, "#060814");
    background.addColorStop(1, "#020308");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    for (const star of stars) {
      const x = ((star.x + simulationTime * star.drift) % 1) * width;
      const y = star.y * height;
      ctx.globalAlpha = star.glow;
      ctx.fillStyle = "#fff7de";
      ctx.beginPath();
      ctx.arc(x, y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(settings.yaw - 0.22 + Math.sin(simulationTime * 0.16) * 0.08);
    ctx.scale(1.68, 0.32 + settings.inclination / 235);

    const diskGradient = ctx.createRadialGradient(0, 0, horizon * 1.55, 0, 0, scale * 0.48);
    const hydroOpacity = settings.diskBrightness * Math.pow(settings.accretionRate, 0.55);
    const turbulentContrast = 0.88 + Math.sqrt(settings.alphaViscosity) * 0.18;
    diskGradient.addColorStop(0.18, "rgba(255, 237, 180, 0)");
    diskGradient.addColorStop(0.3, `rgba(255, 238, 185, ${0.42 * hydroOpacity * turbulentContrast})`);
    diskGradient.addColorStop(0.5, `rgba(235, 132, 48, ${0.28 * hydroOpacity})`);
    diskGradient.addColorStop(0.75, `rgba(126, 92, 58, ${0.13 * hydroOpacity})`);
    diskGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = diskGradient;
    ctx.beginPath();
    ctx.arc(0, 0, scale * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const lensGlow = ctx.createRadialGradient(cx, cy, ring * 0.75, cx, cy, ring * 1.38);
    lensGlow.addColorStop(0, "rgba(0, 0, 0, 0)");
    lensGlow.addColorStop(0.6, "rgba(255, 154, 54, 0.78)");
    lensGlow.addColorStop(0.78, "rgba(255, 225, 156, 0.42)");
    lensGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = lensGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, ring * 1.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(cx, cy, horizon, 0, Math.PI * 2);
    ctx.fill();

    const shadow = ctx.createRadialGradient(cx, cy, horizon, cx, cy, horizon * 4.5);
    shadow.addColorStop(0, "rgba(0,0,0,1)");
    shadow.addColorStop(0.38, "rgba(0,0,0,0.72)");
    shadow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(cx, cy, horizon * 4.5, 0, Math.PI * 2);
    ctx.fill();

    window.requestAnimationFrame(render);
  };

  window.addEventListener("resize", resize);
  window.requestAnimationFrame(render);
}

function bootSimulation() {
  const canvas = document.querySelector("#black-hole-canvas");
  const gl =
    canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      powerPreference: "high-performance",
    }) ||
    canvas.getContext("experimental-webgl", {
    alpha: false,
    antialias: false,
    powerPreference: "high-performance",
    });

  if (!gl) {
    bootCanvasFallback(canvas);
    return;
  }

  let program;

  try {
    program = createProgram(gl);
  } catch (error) {
    console.error(error);
    bootCanvasFallback(canvas);
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
    cameraRadius: gl.getUniformLocation(program, "uCameraRadius"),
    accretionRate: gl.getUniformLocation(program, "uAccretionRate"),
    alphaViscosity: gl.getUniformLocation(program, "uAlphaViscosity"),
    yaw: gl.getUniformLocation(program, "uYaw"),
    pan: gl.getUniformLocation(program, "uPan"),
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

  new ResizeObserver(resize).observe(canvas);
  resize();

  let lastTimestamp = null;
  let simulationTime = 0;

  const render = (timestamp) => {
    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    }

    const delta = Math.min(80, timestamp - lastTimestamp);
    lastTimestamp = timestamp;

    if (!settings.paused) {
      simulationTime += (delta / 1000) * settings.timeScale;
    }

    resize();
    gl.useProgram(program);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.time, simulationTime);
    gl.uniform1f(uniforms.mass, settings.mass);
    gl.uniform1f(uniforms.inclination, settings.inclination);
    gl.uniform1f(uniforms.exposure, settings.exposure);
    gl.uniform1f(uniforms.fov, settings.fov);
    gl.uniform1f(uniforms.cameraRadius, settings.cameraRadius);
    gl.uniform1f(uniforms.accretionRate, settings.accretionRate);
    gl.uniform1f(uniforms.alphaViscosity, settings.alphaViscosity);
    gl.uniform1f(uniforms.yaw, settings.yaw);
    gl.uniform2f(uniforms.pan, settings.panX, settings.panY);
    gl.uniform1f(uniforms.diskBrightness, settings.diskBrightness);
    gl.uniform1i(uniforms.steps, settings.steps);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    updateStatus("running", "Tracing u(phi) geodesics");
    window.requestAnimationFrame(render);
  };

  window.requestAnimationFrame(render);
}

document.addEventListener("DOMContentLoaded", () => {
  bindTabs();
  bindUiToggle();
  bindControls();
  bindPointerControls(document.querySelector("#black-hole-canvas"));
  bootSimulation();
});
