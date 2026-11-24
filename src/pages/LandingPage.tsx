import Header from "../components/Header";
import SiteFooter from "../components/SiteFooter";
import { navigate } from "../router";
import "./ContentPage.css";
import "./LandingPage.css";

const STEPS = [
  {
    title: "Set the details",
    body: "Name it, choose a draw date and a budget, and say whether you are taking part.",
  },
  {
    title: "Share one link",
    body: "Invitees register in seconds. No account, no app, and no password.",
  },
  {
    title: "Names go out privately",
    body: "On the draw date each person is told who they have. Nobody sees the whole list, including you.",
  },
];

const DIFFERENCES = [
  {
    title: "Restrictions that work in one direction",
    body: "“Won’t give to” and “won’t receive from” are different things, and each person sets their own. Yours never appear on anyone else’s list.",
  },
  {
    title: "Problems surface before the draw",
    body: "If restrictions make a draw impossible, you are told which people are blocking it and what to change, rather than finding out on the day.",
  },
  {
    title: "It is not only for gifts",
    body: "A book swap, an office Secret Santa, a teacher pairing students, or deciding who reviews whose work.",
  },
  {
    title: "Nobody signs up",
    body: "Not the people you invite, and not you. A link is all anyone needs.",
  },
];

export default function LandingPage() {
  const startExchange = () => navigate("/create");

  return (
    <>
      <Header onStartExchange={startExchange} />

      <main className="landing">
        <section className="landing-hero">
          <div className="landing-hero-text">
            <h1>Draw names without making anyone sign up.</h1>

            <p className="landing-lede">
              Set up a gift exchange, a book swap, or a classroom draw in
              about two minutes. Share one link. Everyone finds out who
              they have, privately.
            </p>

            <div className="landing-cta-row">
              <button
                type="button"
                className="landing-cta"
                onClick={startExchange}
              >
                Start a Gift Exchange
              </button>

              <a className="landing-secondary" href="#how-it-works">
                See how it works
              </a>
            </div>

            <p className="landing-note">
              Free, and no account needed, for you or for anyone you
              invite.
            </p>

            <p className="landing-note landing-note-wip">
              Early preview: you can build an exchange and check the
              draw, but nothing is saved between visits yet.
            </p>
          </div>

          <div className="landing-hero-art">
            <img
              src="/images/pigeon-messenger.png"
              alt="A carrier pigeon delivering a sealed envelope"
              width="700"
              height="581"
            />
          </div>
        </section>

        <section className="landing-section" id="how-it-works">
          <h2>How it works</h2>

          <ol className="landing-steps">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="landing-step-number">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section landing-section-tinted">
          <h2>Why this one</h2>

          <div className="landing-points">
            {DIFFERENCES.map((point) => (
              <div key={point.title} className="landing-point">
                <h3>{point.title}</h3>
                <p>{point.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-section" id="quick-draw">
          <h2>Need names matched right now?</h2>

          <p className="landing-quick-copy">
            Quick Draw skips the invitations. Paste a list of names, say
            what the draw is for, and get the result on the spot: a book
            swap you forgot to assign, partners for an assignment,
            groups of three, or who reviews whose work. Nobody registers,
            and nothing is sent anywhere.
          </p>

          <a className="landing-secondary" href="#/quick">
            Create a Quick Draw
          </a>
        </section>

        <section className="landing-closing">
          <h2>Ready to draw some names?</h2>

          <p>
            It takes about two minutes, and the people you invite never
            have to make an account.
          </p>

          <button
            type="button"
            className="landing-cta"
            onClick={startExchange}
          >
            Start a Gift Exchange
          </button>
        </section>

      </main>

      <SiteFooter />
    </>
  );
}
