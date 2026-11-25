import Header from "../components/Header";
import SiteFooter from "../components/SiteFooter";
import { navigate } from "../router";
import "./ContentPage.css";

const QUESTIONS = [
  {
    q: "Does anyone need an account?",
    a: "No. Not the people you invite, and not you. You create an exchange and get a link; everyone who follows that link registers with a name and an email address, and that's the whole of it.",
  },
  {
    q: "Can the organizer see who drew whom?",
    a: "Not the matches, no. Each person is told their own recipient and nothing else. The organizer does see who has registered and which restrictions each person has set, because they're the one who has to sort it out if those restrictions make a draw impossible. If the organizer is taking part, they find out who they're buying for at the same time as everyone else.",
  },
  {
    q: "What's a restriction?",
    a: "A person you shouldn't be matched with. They work in one direction: “won’t give to” and “won’t receive from” are separate choices, because they're genuinely different things. Each participant sets their own, and yours never appear on anyone else’s list.",
  },
  {
    q: "What if the restrictions make a draw impossible?",
    a: "The organizer is told before the draw date, not on it. The exchange is checked against every restriction, and if no valid draw exists the organizer is shown which people are blocking it and the smallest set of restrictions that would free it up.",
  },
  {
    q: "When can I set my restrictions?",
    a: "Once registration closes. Restrictions are choices about the other people in the exchange, so they only make sense when the list of those people is final. From the registration deadline until the draw date you can set and change them as often as you like.",
  },
  {
    q: "Can I use this for something other than gifts?",
    a: "Yes. A book swap, an office Secret Santa, a teacher pairing students, or deciding who reviews whose work. Anywhere each person needs to be matched with exactly one other person. If you need it sorted out this minute rather than on a draw date, use Quick Draw instead.",
  },
  {
    q: "What's Quick Draw?",
    a: "The same matching, without the waiting. Paste a list of names, say what the draw is for, and the result appears straight away: everyone draws a name, each person gets someone else's work to review, partners, or groups of whatever size you choose. Nobody registers, nothing is emailed, and the draw happens in your browser rather than on our end. It suits a classroom or a room full of people, where you're the one reading the result out. A list of names can be loaded from a .csv or .txt file and saved back to one, so the same class, team, or club doesn't have to be typed in every week. That file stays on your own computer.",
  },
  {
    q: "Can I reuse an exchange next year?",
    a: "Yes. Save it as a template, then import that file next time. Dates roll forward by whole years, so a 24 December draw stays on 24 December, and a fresh event code is generated so last year’s invitation links can't be used by mistake.",
  },
  {
    q: "What happens if somebody doesn't register in time?",
    a: "They aren't in the draw. Only people who have registered by the deadline are matched, so nobody ends up buying for someone who never joined. If somebody misses it and you want them in after all, the organizer can reopen registration from Manage Exchange at any point before the draw, and that person can then register with the link they already have.",
  },
  {
    q: "Can I close registration early?",
    a: "Yes. Registration closes on its deadline by itself, but the organizer can close it sooner from Manage Exchange once everyone has joined, which stops anyone else registering. It reopens just as easily. Closing early doesn't move the date restrictions open, though: that still follows the registration deadline you set, so everyone chooses against a list that's genuinely final.",
  },
  {
    q: "What if the registration link gets out?",
    a: "Generate a new code from Manage Exchange. Every link and invitation already sent stops working the moment you do, which is the point, but it stops working for everybody: the people who have already registered use that same link to come back and set their restrictions. Send the new link to your whole list, not only to the people who haven't joined yet.",
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
          How Mystery Name Draw works, and what it doesn't do.
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
          <a href="mailto:contact@mysterynamedraw.com">
            contact@mysterynamedraw.com
          </a>
          .
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
