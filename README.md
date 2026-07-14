# Black Hole Geodesic

An interactive personal-site demo that renders light bending around a black hole
with Schwarzschild null-geodesic ray tracing.

Live GitHub Pages site:
[qasrz.github.io/black-hole-geodesic](https://qasrz.github.io/black-hole-geodesic/)

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

## Running locally

No build step is required. Open `index.html` in a browser, or serve the folder
with any static-file server.
