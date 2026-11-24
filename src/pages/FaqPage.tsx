import Header from "../components/Header";
import SiteFooter from "../components/SiteFooter";
import { navigate } from "../router";
import "./ContentPage.css";

const QUESTIONS = [
  {
    q: "Does anyone need an account?",
    a: "No. Not the people you invite, and not you. You create an exchange and get a link; everyone who follows that link registers with a name and an email address, and that is the whole of it.",
  },
  {
    q: "Can the organizer see who drew whom?",
    a: "No. Each person is told their own recipient and nothing else, and the organizer sees only how many people have registered. If you are taking part yourself, you find out at the same time as everyone else.",
  },
  {
    q: "What is a restriction?",
    a: "A person you should not be matched with. They work in one direction: “won’t give to” and “won’t receive from” are separate choices, because they are genuinely different things. Each participant sets their own, and yours never appear on anyone else’s list.",
  },
  {
    q: "What if the restrictions make a draw impossible?",
    a: "You are told before the draw date, not on it. The exchange is checked against every restriction, and if no valid draw exists you are shown which people are blocking it and the smallest set of restrictions that would free it up.",
  },
  {
    q: "Can I use this for something other than gifts?",
    a: "Yes. A book swap, an office Secret Santa, a teacher pairing students, or deciding who reviews whose work. Anywhere each person needs to be matched with exactly one other person.",
  },
  {
    q: "Can I reuse an exchange next year?",
    a: "Yes. Save it as a template, then import that file next time. Dates roll forward by whole years, so a 24 December draw stays on 24 December, and a fresh event code is generated so last year’s invitation links cannot be used by mistake.",
  },
  {
    q: "What happens if somebody does not register in time?",
    a: "They are not in the draw. Only people who have registered by the deadline are matched, so nobody ends up buying for someone who never joined.",
  },
  {
    q: "What does it cost?",
    a: "Nothing.",
  },
];

export default function FaqPage() {
  return (
    <>
      <Header onStartExchange={() => navigate("/create")} />

      <main className="content-page">
        <h1>Questions</h1>

        <p className="content-lede">
          How Mystery Name Draw works, and what it does not do.
        </p>

        {QUESTIONS.map((item) => (
          <section key={item.q}>
            <h2>{item.q}</h2>
            <p>{item.a}</p>
          </section>
        ))}

        <h2>Something not answered here?</h2>
        <p>
          Email{" "}
          <a href="mailto:contact@brainbenchapps.com">
            contact@brainbenchapps.com
          </a>
          .
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
