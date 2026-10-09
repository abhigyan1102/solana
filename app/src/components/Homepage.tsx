import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import "./Homepage.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const REPOSITORY = "https://github.com/abhigyan1102/solana";
const EXPLORER =
  "https://explorer.solana.com/address/EdskrgG3PmMPxzaNuvp7oJjZ5MU3jkXmY4bHbSYpnsWF?cluster=devnet";
const ART = "/homepage/guardian-gate.jpg";

function Icon({
  name,
  className = "",
}: {
  name:
    | "arrow"
    | "shield"
    | "check"
    | "pause"
    | "file"
    | "close"
    | "menu"
    | "github";
  className?: string;
}) {
  const paths = {
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    shield: <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />,
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    pause: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 8v8M15 8v8" />
      </>
    ),
    file: (
      <>
        <path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6M9 16h6" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    github: (
      <>
        <path d="M9 19c-4 1-4-2-6-2m12 5v-4c0-1-.3-2-1-2 4-.5 6-2 6-6 0-1-.5-3-1-3 0-1 0-3-1-4-2 0-3 1-4 2-2-.5-4-.5-6 0-1-1-2-2-4-2-1 1-1 3-1 4-.5 0-1 2-1 3 0 4 2 5.5 6 6-.7.5-1 1-1 2v4" />
      </>
    ),
  };
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

const outcomes = [
  {
    name: "Allowed",
    tone: "allowed",
    title: "Within your boundaries.",
    description:
      "An illustrative small transfer through an allowed program, within the per-transaction and daily limits.",
    rule: "Spend limits and program checks pass.",
  },
  {
    name: "Warning",
    tone: "warning",
    title: "A reason to take a closer look.",
    description:
      "An illustrative request above the manual-approval threshold. The policy engine flags it for attention.",
    rule: "A warning is a policy signal, not an enforced approval flow.",
  },
  {
    name: "Blocked",
    tone: "blocked",
    title: "Outside the policy. Stopped.",
    description:
      "An illustrative request over the spending limit, to a blocked program, or while the agent is paused.",
    rule: "The policy engine rejects the proposed request.",
  },
];

export default function Homepage({
  onViewDemo,
  onOpenConsole,
}: {
  onViewDemo: () => void;
  onOpenConsole: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [outcomeIndex, setOutcomeIndex] = useState(0);
  const outcome = outcomes[outcomeIndex];

  useEffect(() => {
    if (!window.location.hash) window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".sg-hero-copy > *", {
          y: 22,
          opacity: 0,
          stagger: 0.1,
          duration: 0.8,
          ease: "power3.out",
          clearProps: "all",
        });
        gsap.from(".sg-hero-art", {
          scale: 0.92,
          opacity: 0,
          duration: 1.2,
          ease: "power2.out",
          clearProps: "all",
        });
        gsap.utils.toArray<HTMLElement>(".sg-reveal").forEach((element) => {
          gsap.from(element, {
            y: 30,
            opacity: 0,
            duration: 0.75,
            ease: "power2.out",
            clearProps: "all",
            scrollTrigger: { trigger: element, start: "top 92%", once: true },
          });
        });
        gsap.fromTo(
          ".sg-feature-art",
          { scale: 0.8 },
          {
            scale: 1,
            ease: "none",
            scrollTrigger: {
              trigger: ".sg-controls",
              start: "top bottom",
              end: "top 20%",
              scrub: 1,
            },
          },
        );
        gsap.to(".sg-feature-art", {
          opacity: 0.2,
          ease: "none",
          scrollTrigger: {
            trigger: ".sg-controls",
            start: "bottom 40%",
            end: "bottom top",
            scrub: 1,
          },
        });
        gsap.to(".sg-marquee-track", {
          xPercent: -50,
          duration: 38,
          repeat: -1,
          ease: "none",
        });
      });
      media.add(
        "(min-width: 900px) and (prefers-reduced-motion: no-preference)",
        () => {
          gsap.utils
            .toArray<HTMLElement>(".sg-step")
            .slice(1)
            .forEach((card, index) => {
              gsap.from(card, {
                y: 55 + index * 20,
                rotation: 2,
                ease: "none",
                scrollTrigger: {
                  trigger: ".sg-steps",
                  start: "top 85%",
                  end: "bottom 70%",
                  scrub: 1,
                },
              });
            });
        },
      );
      return () => media.revert();
    },
    { scope: root },
  );

  const exploreDemo = () => {
    window.scrollTo({ top: 0, behavior: "instant" });
    onViewDemo();
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <main
      ref={root}
      className="sg-home overflow-x-hidden w-full max-w-full"
      id="top"
    >
      <a className="sg-skip" href="#home-content">
        Skip to content
      </a>
      <header className="sg-header sg-container">
        <a href="#top" className="sg-brand" aria-label="SolanaGuard home">
          <Icon name="shield" />
          <span>SolanaGuard</span>
        </a>
        <nav className="sg-desktop-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#policy-controls">Policy controls</a>
        </nav>
        <div className="sg-nav-actions">
          <a
            className="sg-github"
            href={REPOSITORY}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="SolanaGuard on GitHub"
          >
            <Icon name="github" />
          </a>
          <button
            className="sg-button sg-button-lime sg-console-button"
            onClick={onOpenConsole}
          >
            Open console <Icon name="arrow" />
          </button>
          <button
            className="sg-menu-button"
            type="button"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="sg-mobile-menu"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Icon name={menuOpen ? "close" : "menu"} />
          </button>
        </div>
        {menuOpen && (
          <nav
            id="sg-mobile-menu"
            className="sg-mobile-menu"
            aria-label="Mobile navigation"
          >
            <a href="#how-it-works" onClick={closeMenu}>
              How it works
            </a>
            <a href="#policy-controls" onClick={closeMenu}>
              Policy controls
            </a>
            <a
              href={REPOSITORY}
              target="_blank"
              rel="noopener noreferrer"
              onClick={closeMenu}
            >
              GitHub
            </a>
          </nav>
        )}
      </header>

      <section
        className="sg-hero sg-container"
        id="home-content"
        aria-labelledby="sg-hero-title"
      >
        <div className="sg-hero-copy">
          <h1 id="sg-hero-title" className="max-w-6xl">
            Autonomous agents.
            <br />
            <span>Your rules.</span>
          </h1>
          <p>
            A policy firewall for AI-agent Solana wallets. Check proposed
            transactions against your limits, and keep every decision in view.
          </p>
          <div className="sg-hero-actions">
            <button className="sg-button sg-button-lime" onClick={exploreDemo}>
              Explore the demo <Icon name="arrow" />
            </button>
            <a className="sg-button sg-button-outline" href="#how-it-works">
              How it works
            </a>
          </div>
          <span className="sg-hero-note">No wallet required for the demo.</span>
        </div>
        <div className="sg-hero-art">
          <img
            src={ART}
            alt="A sculptural glass gate with a citron-lit opening and two metal beams passing through it"
            width="1536"
            height="1024"
            {...{ fetchpriority: "high" }}
          />
        </div>
      </section>

      <div className="sg-capabilities sg-container">
        <div className="sg-solana">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M5 4h17l-4 4H1l4-4Zm-4 6h17l4 4H5l-4-4Zm4 6h17l-4 4H1l4-4Z" />
          </svg>
          Built for Solana
        </div>
        <div
          className="sg-marquee"
          aria-label="Spend limits, program controls, emergency pause"
        >
          <div className="sg-marquee-track" aria-hidden="true">
            {[0, 1].map((copy) => (
              <div className="sg-marquee-copy" key={copy}>
                <span>Spend limits</span>
                <span>Program controls</span>
                <span>Emergency pause</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section
        className="sg-controls sg-container sg-section"
        id="policy-controls"
        aria-labelledby="sg-controls-title"
      >
        <div className="sg-section-heading sg-reveal">
          <h2 id="sg-controls-title">
            The boundaries
            <br />
            are yours.
          </h2>
          <p>
            Give your agent room to act.
            <br />
            Decide how far it can go.
          </p>
        </div>
        <div className="sg-feature-grid grid-flow-dense">
          <article className="sg-feature sg-spending sg-reveal">
            <div className="sg-feature-media">
              <img
                className="sg-feature-art"
                src={ART}
                alt=""
                loading="lazy"
                width="1536"
                height="1024"
              />
            </div>
            <div className="sg-feature-copy">
              <h3>Set the spending ceiling.</h3>
              <p>
                Per-transaction and daily limits keep proposed spending within
                your policy.
              </p>
            </div>
          </article>
          <article className="sg-feature sg-programs sg-reveal">
            <h3>
              Choose the
              <br />
              programs.
            </h3>
            <div
              className="sg-program-list"
              aria-label="Examples of program controls"
            >
              <div>
                <span className="sg-program-symbol">S</span>
                <span>System Program</span>
                <span className="sg-program-state">Allow</span>
              </div>
              <div>
                <span className="sg-program-symbol">T</span>
                <span>Token Program</span>
                <span className="sg-program-state">Allow</span>
              </div>
              <div>
                <span className="sg-program-symbol sg-symbol-blocked">×</span>
                <span>Other programs</span>
                <span className="sg-program-state sg-state-muted">
                  Your rules
                </span>
              </div>
            </div>
            <p>Define the programs your agent may interact with.</p>
          </article>
          <article className="sg-feature sg-reasons sg-reveal">
            <h3>See the reason.</h3>
            <div className="sg-reason-visual" aria-hidden="true">
              <span className="sg-reason-line" />
              <span className="sg-reason-line" />
              <span className="sg-reason-line" />
              <Icon name="check" />
            </div>
            <p>
              Inspect the risk score and matched rules behind every decision.
            </p>
          </article>
          <article className="sg-feature sg-pause sg-reveal">
            <div>
              <h3>
                Pause when
                <br />
                you need to.
              </h3>
              <p>Emergency pause blocks new requests for the selected agent.</p>
            </div>
            <Icon name="pause" />
          </article>
        </div>
      </section>

      <section
        className="sg-workflow sg-container sg-section"
        id="how-it-works"
        aria-labelledby="sg-workflow-title"
      >
        <div className="sg-workflow-copy sg-reveal">
          <h2 id="sg-workflow-title">
            One intent.
            <br />A clear decision.
          </h2>
          <p>
            Register an agent. Set a policy.
            <br />
            Inspect the result.
          </p>
          <button className="sg-text-link" onClick={exploreDemo}>
            Try the walkthrough <Icon name="arrow" />
          </button>
          <div className="sg-workflow-status">
            <span className="sg-status-dot" />
            <span>Devnet MVP · policy evaluation</span>
          </div>
        </div>
        <div className="sg-workflow-right">
          <div className="sg-steps">
            <div className="sg-step">
              <Icon name="file" />
              <div>
                <h3>An agent proposes.</h3>
                <p>A transfer, a payment, a program interaction.</p>
              </div>
              <Icon name="arrow" className="sg-step-arrow" />
            </div>
            <div className="sg-step">
              <Icon name="shield" />
              <div>
                <h3>Your policy checks.</h3>
                <p>Amount. Daily spend. Programs. Pause state.</p>
              </div>
              <Icon name="arrow" className="sg-step-arrow" />
            </div>
            <div className="sg-step sg-step-final">
              <Icon name="check" />
              <div>
                <h3>You see the outcome.</h3>
                <p>Allowed, warning, or blocked—with a reason.</p>
              </div>
              <Icon name="arrow" className="sg-step-arrow" />
            </div>
          </div>
          <div
            className="sg-outcome-carousel"
            role="region"
            aria-label="Illustrative policy outcomes"
            aria-roledescription="carousel"
          >
            <div className="sg-outcome-controls">
              <div
                className="sg-outcome-options"
                role="group"
                aria-label="Choose an illustrative outcome"
              >
                {outcomes.map((item, index) => (
                  <button
                    key={item.name}
                    className={
                      outcomeIndex === index
                        ? `sg-selected sg-tone-${item.tone}`
                        : ""
                    }
                    aria-pressed={outcomeIndex === index}
                    onClick={() => setOutcomeIndex(index)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              <button
                className="sg-next-outcome"
                aria-label="Next policy outcome"
                onClick={() =>
                  setOutcomeIndex((outcomeIndex + 1) % outcomes.length)
                }
              >
                <Icon name="arrow" />
              </button>
            </div>
            <div
              className={`sg-outcome-copy sg-tone-${outcome.tone}`}
              aria-live="polite"
              aria-atomic="true"
            >
              <h4>{outcome.title}</h4>
              <p>{outcome.description}</p>
              <span>{outcome.rule}</span>
            </div>
            <p className="sg-example-note">
              Illustrative policy outcomes. No funds are moved.
            </p>
          </div>
        </div>
      </section>

      <section className="sg-action" aria-labelledby="sg-action-title">
        <div className="sg-container sg-reveal">
          <h2 id="sg-action-title">
            Give your agent
            <br />
            <span className="sg-inline-art" aria-hidden="true">
              <img src={ART} alt="" width="1536" height="1024" loading="lazy" />
            </span>{" "}
            clear boundaries.
          </h2>
          <div className="sg-action-bottom">
            <p>
              Start with a read-only walkthrough.
              <br />
              Connect a wallet when you are ready.
            </p>
            <button className="sg-button sg-button-dark" onClick={exploreDemo}>
              Explore the demo <Icon name="arrow" />
            </button>
          </div>
        </div>
      </section>

      <footer className="sg-footer sg-container">
        <div className="sg-footer-main">
          <a href="#top" className="sg-brand">
            <Icon name="shield" />
            <span>SolanaGuard</span>
          </a>
          <nav aria-label="Footer navigation">
            <a href={REPOSITORY} target="_blank" rel="noopener noreferrer">
              GitHub <Icon name="arrow" />
            </a>
            <a
              href={`${REPOSITORY}#readme`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Read the docs <Icon name="arrow" />
            </a>
            <a href={EXPLORER} target="_blank" rel="noopener noreferrer">
              Devnet program <Icon name="arrow" />
            </a>
          </nav>
        </div>
        <div className="sg-footer-bottom">
          <p>
            Devnet MVP. Not audited. Guarded fund movement is still in
            development.
          </p>
          <a href="#top">Back to top ↑</a>
        </div>
      </footer>
    </main>
  );
}
