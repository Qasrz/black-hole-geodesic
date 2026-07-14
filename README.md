# Black Hole Geodesic

An interactive personal-portfolio demo that renders light bending around a black
hole with Schwarzschild null-geodesic ray tracing.

Live site:
[black-hole-geodesic-lab.q-b-oneil.chatgpt.site](https://black-hole-geodesic-lab.q-b-oneil.chatgpt.site)

## What it demonstrates

- WebGL fragment-shader rendering
- Per-pixel null-geodesic ray integration
- Schwarzschild event-horizon capture
- Photon-ring and accretion-disk visualization
- Responsive, portfolio-ready interaction design

## Physics model

This first version models a non-rotating Schwarzschild black hole. For each
screen ray, the shader launches a photon from a finite camera radius and
integrates the radial null-geodesic equation:

```txt
(dr/dλ)² = E² − (1 − 2M/r)L²/r²
```

The implementation uses an RK4 stepper in the shader and treats rays as captured
when they cross the event horizon at `r = 2M`.

## Future upgrades

- Kerr geodesics for spin and frame dragging
- Better accretion-disk radiative transfer
- A write-up section explaining the derivation
- Portfolio homepage sections around projects, resume, and contact

## Local development

```bash
npm install
npm run dev
npm run build
```

Requires Node.js `>=22.13.0`.
