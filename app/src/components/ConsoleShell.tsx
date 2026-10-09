import { ReactNode, useEffect, useRef, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import "./Console.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function ConsoleIcon({
  name,
  className = "",
}: {
  name: "shield" | "wallet" | "arrow" | "menu" | "close" | "records";
  className?: string;
}) {
  const paths = {
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    wallet: (
      <>
        <path d="M20 8V5H5a2 2 0 0 0 0 4h15v11H5a2 2 0 0 1-2-2V7" />
        <path d="M20 12h-6v5h6M17 14.5h.01" />
      </>
    ),
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    records: <path d="M6 7h12M6 12h12M6 17h12" />,
  };
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}

export default function ConsoleShell({
  children,
  connected = false,
  walletAddress = "",
  demo = false,
  onHome,
  onDemo,
  onConsole,
}: {
  children: ReactNode;
  connected?: boolean;
  walletAddress?: string;
  demo?: boolean;
  onHome: () => void;
  onDemo?: () => void;
  onConsole?: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState("overview");
  const prefix = demo ? "demo" : "console";
  const sections = demo
    ? [
        ["overview", "Overview"],
        ["agents", "Agent"],
        ["policy", "Policy"],
        ["simulator", "Scenarios"],
        ["activity", "Sample log"],
      ]
    : [
        ["overview", "Overview"],
        ["agents", "Agents"],
        ["policy", "Policy"],
        ["simulator", "Simulator"],
        ["activity", "Activity"],
      ];

  useEffect(() => {
    let frame = 0;
    const alignSection = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const destination = window.location.hash.slice(1);
        if (destination.startsWith(`${prefix}-`)) {
          document
            .getElementById(destination)
            ?.scrollIntoView({ behavior: "instant", block: "start" });
        }
      });
    };
    alignSection();
    window.addEventListener("load", alignSection);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("load", alignSection);
    };
  }, [prefix]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length)
          setActive((previous) => {
            const ids = visible.map((entry) =>
              entry.target.id.replace(`${prefix}-`, ""),
            );
            return ids.includes(previous) ? previous : ids[0];
          });
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );
    root.current
      ?.querySelectorAll("[data-console-section]")
      .forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [prefix]);

  useGSAP(
    () => {
      const motion = gsap.matchMedia();
      motion.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".sg-console-hero h1, .sg-console-hero > p", {
          y: 18,
          opacity: 0,
          duration: 0.75,
          stagger: 0.12,
          ease: "power3.out",
        });
        gsap.to(".sg-console-art", {
          scale: 1.08,
          opacity: 0.2,
          ease: "none",
          scrollTrigger: {
            trigger: ".sg-console-hero",
            start: "top top",
            end: "bottom top",
            scrub: 0.6,
          },
        });
        gsap.fromTo(
          ".sg-console-intro",
          { opacity: 0.65 },
          {
            opacity: 1,
            ease: "none",
            scrollTrigger: {
              trigger: ".sg-console-wallet",
              start: "top 90%",
              end: "top 55%",
              scrub: 0.5,
            },
          },
        );
      });
      return () => motion.revert();
    },
    { scope: root },
  );

  return (
    <main className="sg-console" ref={root}>
      <a className="sg-console-skip" href={`#${prefix}-agents`}>
        Skip to workspace
      </a>
      <header className="sg-console-header">
        <div className="sg-console-nav">
          <a className="sg-console-brand" href={`#${prefix}-overview`}>
            <ConsoleIcon name="shield" />
            <span>SolanaGuard</span>
          </a>
          <nav
            className={
              menuOpen ? "sg-console-links is-open" : "sg-console-links"
            }
            aria-label={demo ? "Demo workspace" : "Console workspace"}
            id="console-navigation"
          >
            {sections.map(([id, label]) => (
              <a
                key={id}
                href={`#${prefix}-${id}`}
                aria-current={active === id ? "location" : undefined}
                onClick={() => {
                  setActive(id);
                  setMenuOpen(false);
                }}
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="sg-console-nav-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onHome}
            >
              Back to home
            </button>
            <button
              className="sg-console-menu"
              type="button"
              aria-label={
                menuOpen ? "Close workspace menu" : "Open workspace menu"
              }
              aria-expanded={menuOpen}
              aria-controls="console-navigation"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <ConsoleIcon name={menuOpen ? "close" : "menu"} />
            </button>
          </div>
        </div>
      </header>
      <section
        className="sg-console-hero"
        id={`${prefix}-overview`}
        data-console-section
      >
        <img
          className="sg-console-art"
          src="/homepage/guardian-gate.jpg"
          alt=""
        />
        <h1>
          {demo ? "See a policy in action." : "Your agents. Your control."}
        </h1>
        <p>
          {demo
            ? "Explore example decisions before connecting a wallet."
            : "Define the boundaries. Inspect every proposed action."}
        </p>
      </section>
      <div className="sg-console-content">
        <section className="sg-console-wallet" aria-label="Wallet connection">
          <ConsoleIcon name="wallet" />
          <div className="sg-console-intro">
            <h2>
              {demo
                ? "You’re exploring the demo"
                : connected
                  ? "Your wallet is connected"
                  : "Connect your wallet"}
            </h2>
            <p>
              {demo
                ? "Illustrative, read-only examples. No requests are sent to the policy engine."
                : connected
                  ? "Agents, policies, and records are scoped to this wallet."
                  : "Your wallet identifies the agents and policies you manage."}
            </p>
            {connected && !demo ? <code>{walletAddress}</code> : null}
          </div>
          <div className="sg-console-wallet-actions">
            {demo ? (
              <button
                className="btn btn-primary"
                type="button"
                onClick={onConsole}
              >
                Open console <ConsoleIcon name="arrow" />
              </button>
            ) : (
              <WalletMultiButton>
                {!connected ? "Connect wallet" : undefined}
              </WalletMultiButton>
            )}
            {!demo && !connected ? (
              <button
                className="sg-console-text-button"
                type="button"
                onClick={onDemo}
              >
                Try the demo <ConsoleIcon name="arrow" />
              </button>
            ) : null}
          </div>
        </section>
        {children}
        <footer className="sg-console-footer">
          <p>
            Solana devnet <span>·</span> Not audited <span>·</span> Guarded fund
            movement is still in development.
          </p>
          <a
            href="https://github.com/abhigyan1102/solana"
            target="_blank"
            rel="noreferrer"
          >
            GitHub <ConsoleIcon name="arrow" />
          </a>
        </footer>
      </div>
    </main>
  );
}

export function ConsoleEmpty({
  title = "No activity loaded",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <ConsoleIcon name="records" />
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

export function ConsoleGuide() {
  return (
    <div className="sg-console-guide" aria-label="Workspace guide">
      {[
        [
          "Register an agent",
          "Give an agent a name and link it to your connected wallet.",
          "agents",
          "Go to registration",
        ],
        [
          "Build a policy",
          "Set spending limits, program permissions, and an emergency pause.",
          "policy",
          "Go to policy builder",
        ],
        [
          "Inspect a request",
          "Evaluate an intent, read the decision, and review its audit record.",
          "simulator",
          "Go to simulator",
        ],
      ].map(([title, text, id, link]) => (
        <details key={id}>
          <summary>
            {title}
            <ConsoleIcon name="arrow" />
          </summary>
          <p>{text}</p>
          <a href={`#console-${id}`}>
            {link}
            <ConsoleIcon name="arrow" />
          </a>
        </details>
      ))}
    </div>
  );
}

export function ConsoleRecordsEmpty({
  kind,
  children,
}: {
  kind: "history" | "audit";
  children: ReactNode;
}) {
  const columns =
    kind === "history"
      ? ["Decision", "Amount", "Type", "Program", "Reason", "Time"]
      : ["Decision", "Risk", "Reason", "Audit ID", "Request ID", "Time"];
  return (
    <div
      className="table-wrap"
      tabIndex={0}
      role="region"
      aria-label={
        kind === "history" ? "Transaction history table" : "Audit log table"
      }
    >
      <table className="audit-table is-empty">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={columns.length} className="sg-console-empty-cell">
              <ConsoleEmpty>{children}</ConsoleEmpty>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
