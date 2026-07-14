# Black Hole Geodesic

An interactive personal-site demo that renders light bending around a black hole
with Schwarzschild null-geodesic ray tracing.

Live GitHub Pages site:
[qasrz.github.io/black-hole-geodesic](https://qasrz.github.io/black-hole-geodesic/)

## What it demonstrates

- Plain HTML/CSS/JavaScript with no npm dependency
- WebGL fragment-shader rendering with a canvas fallback
- Per-pixel null-geodesic ray integration
- Schwarzschild event-horizon capture
- Photon-ring and thin accretion-disk visualization
- ISCO cutoff, relativistic Doppler beaming, gravitational redshift, and
  temperature-based disk color
- Mouse-driven orbit, pan, and zoom controls
- A translucent pop-up control dock that stays out of the scene until opened
- Responsive, portfolio-ready interaction design

## Controls

- Left-drag: orbit around the black hole
- Middle-drag: pan the view
- Scroll wheel: move the camera closer or farther away
- Controls button: open or close the simulation settings tabs

## Physics model

This first version models a non-rotating Schwarzschild black hole. For each
screen ray, the shader launches a photon from a finite camera radius and
integrates the radial null-geodesic equation:

```txt
(dr/dλ)² = E² − (1 − 2M/r)L²/r²
```

The implementation uses an RK4 stepper in the shader and treats rays as captured
when they cross the event horizon at `r = 2M`.

The accretion disk is modeled as a geometrically thin Schwarzschild disk with an
inner stable circular orbit at `r = 6M`. Disk emission uses a Novikov-Thorne-like
radial flux profile:

```txt
F(r) ∝ r⁻³(1 − √(r_ISCO / r))
```

The visible disk brightness is then adjusted by gravitational redshift and
special-relativistic Doppler beaming from circular orbital motion. It is still a
real-time approximation, not a full radiative-transfer solver, but the visual
model is now tied to actual disk physics.

## Running locally

No install or build step is required. Open `index.html` in a browser, or serve
the folder with any static-file server.
