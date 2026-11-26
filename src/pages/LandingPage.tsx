import Header from "../components/Header";
import SiteFooter from "../components/SiteFooter";
import { navigate } from "../router";
import "./ContentPage.css";
import "./LandingPage.css";

const STEPS = [
  {
    title: "Set the details",
    body: "Name it, choose a draw date and a budget, and say whether you're taking part.",
  },
  {
    title: "Send the invitations",
    body: "Each person gets their own private link by email. Or share one link and let people join themselves.",
  },
  {
    title: "Names go out privately",
    body: "On the draw date each person is told who they have. Nobody sees the whole list, including you.",
  },
];

const DIFFERENCES = [
  {
    title: "Restrictions that work in one direction",
    body: "“Won’t give to” and “won’t receive from” are different things. Anyone can set their own, and you can set them on somebody’s behalf. Neither kind shows up on anyone else’s list.",
  },
  {
    title: "Problems surface before the draw",
    body: "If restrictions make a draw impossible, you're told which people are blocking it and what to change, rather than finding out on the day.",
  },
  {
    title: "It isn't only for gifts",
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
              Set up a gift exchange, a book swap, or a classroom draw
              in about two minutes. Everyone adds a wishlist and can say
              who they'd rather not draw &mdash; and you can set that for
              them too. Each person gets their own link and finds out who
              they drew, and even you won't know who has who.
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

        {/* The two ways in, in the same order as the header: the
            exchange first, Quick Draw beside it. */}
        <section className="landing-closing" id="quick-draw">
          <div className="landing-choices">

            <div className="landing-choice">
              <h2>Ready to draw some names?</h2>

              <p>
                For a draw with a date on it. Invite people by link,
                everyone sets their own restrictions, and nobody finds
                out who they have until the day. It takes about two
                minutes, and the people you invite never have to make an
                account.
              </p>

              <button
                type="button"
                className="landing-cta"
                onClick={startExchange}
              >
                Start a Gift Exchange
              </button>
            </div>

            <div className="landing-choice">
              <h2>Need names matched right now?</h2>

              <p>
                Quick Draw skips the invitations. Paste a list of names,
                say what the draw is for, and get the result on the
                spot: a book swap you forgot to assign, partners for an
                assignment, groups of three, or who reviews whose work.
                Nobody registers, and nothing is sent anywhere.
              </p>

              <a className="landing-choice-secondary" href="#/quick">
                Create a Quick Draw
              </a>
            </div>

          </div>
        </section>

      </main>

      <SiteFooter />
    </>
  );
}
