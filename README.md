# Black Hole Geodesic

An interactive personal-site demo that renders light bending around a black hole
with Schwarzschild null-geodesic ray tracing.

Live GitHub Pages site:
[qasrz.github.io/black-hole-geodesic](https://qasrz.github.io/black-hole-geodesic/)

## What it demonstrates

- Plain HTML/CSS/JavaScript with no npm dependency
- WebGL fragment-shader rendering with a canvas fallback
- Per-pixel null-geodesic ray integration in reciprocal-radius coordinates
- Schwarzschild event-horizon capture
- Photon-ring and thin accretion-disk visualization
- Reduced hydrodynamic alpha-disk model with accretion rate, viscosity, surface
  density, optical depth, temperature, relativistic Doppler beaming, and
  gravitational redshift
- Mouse-driven orbit, pan, and zoom controls
- A translucent pop-up control dock that stays out of the scene until opened
- Responsive, portfolio-ready interaction design

## Controls

- Left-drag: orbit around the black hole
- Middle-drag: pan the view
- Scroll wheel: move the camera closer or farther away
- Controls button: open or close the simulation settings tabs

## Physics model

This version models a non-rotating Schwarzschild black hole. For each screen
ray, the shader launches a photon from a finite camera radius and integrates the
null geodesic in reciprocal-radius coordinates, `u = 1/r`:

```txt
d2u/dphi2 + u = 3 M u2
```

The implementation uses an RK4 stepper in the shader and treats rays as captured
when they cross the event horizon at `r = 2M`.

The accretion disk is modeled as a reduced hydrodynamic Shakura-Sunyaev-style
alpha disk with an inner stable circular orbit at `r = 6M`. It computes
Keplerian angular velocity, scale height, sound speed, viscosity,

```txt
nu = alpha c_s H
```

and a steady surface density from mass conservation. Disk flux follows the
standard thin-disk no-torque inner-boundary profile, then the visible emission
is adjusted by optical depth, gravitational redshift, and special-relativistic
Doppler beaming. This is still a real-time reduced model, not a full 3D GRMHD
solver, but the disk variables are now physically meaningful rather than
decorative noise.

## Running locally

No install or build step is required. Open `index.html` in a browser, or serve
the folder with any static-file server.
