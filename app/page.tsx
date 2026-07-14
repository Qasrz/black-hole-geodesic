import { BlackHoleSimulation } from "./components/BlackHoleSimulation";

export default function Home() {
  return (
    <main className="site-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Portfolio experiment / General relativity</p>
          <h1>Black Hole Geodesic Lab</h1>
          <p className="lede">
            A browser-based physics demo that bends light with the Schwarzschild
            null-geodesic equations, then turns the math into an explorable black
            hole lensing simulation.
          </p>
          <div className="hero-actions" aria-label="Project highlights">
            <span>WebGL shader kernel</span>
            <span>RK4 ray integration</span>
            <span>Real photon capture boundary</span>
          </div>
        </div>
        <aside className="kernel-card" aria-label="Simulation status">
          <div className="kernel-card__row">
            <span className="pulse" aria-hidden="true" />
            <span>Relativistic kernel active</span>
          </div>
          <div className="kernel-card__metric">
            <small>Metric</small>
            <strong>Schwarzschild vacuum</strong>
          </div>
          <div className="kernel-card__metric">
            <small>Photon equation</small>
            <strong>d²r/dλ² = L²/r³ − 3ML²/r⁴</strong>
          </div>
        </aside>
      </section>

      <BlackHoleSimulation />

      <section className="science-grid" aria-label="Project details">
        <article>
          <span>01</span>
          <h2>Actual geodesics, not a fake swirl</h2>
          <p>
            Each screen ray is launched from a finite camera radius with a
            relativistic impact parameter. The shader integrates the null
            geodesic radial equation and uses the event horizon as the capture
            condition.
          </p>
        </article>
        <article>
          <span>02</span>
          <h2>Portfolio-ready technical storytelling</h2>
          <p>
            The interface exposes the mass scale, camera inclination, exposure,
            and integration quality so recruiters can see both the visual polish
            and the engineering decisions behind it.
          </p>
        </article>
        <article>
          <span>03</span>
          <h2>Phase-two path: Kerr</h2>
          <p>
            This first version is intentionally honest: non-rotating
            Schwarzschild spacetime. The next upgrade can add Kerr geodesics for
            frame dragging and an asymmetric shadow.
          </p>
        </article>
      </section>
    </main>
  );
}
