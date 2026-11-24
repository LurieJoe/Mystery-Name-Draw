import Header from "../components/Header";
import SiteFooter from "../components/SiteFooter";
import { navigate } from "../router";
import "./ContentPage.css";

export default function PrivacyPage() {
  return (
    <>
      <Header onStartExchange={() => navigate("/create")} />

      <main className="content-page">
        <h1>Privacy</h1>

        <p className="content-lede">
          A plain-language account of what this site does with your
          information. It is short, because the site does very little.
        </p>

        <h2>The short version</h2>
        <p>
          There are no accounts and no passwords. There is no
          advertising, no tracking, and no analytics. Nothing you type is
          sold or shared with anyone.
        </p>

        <h2>What is stored today</h2>
        <p>
          Nothing. At the moment Mystery Name Draw runs entirely in your
          browser: an exchange you build lives in that browser tab and is
          gone when you close it. Nothing is sent to us, because there is
          nowhere yet to send it.
        </p>
        <p>
          This will change when participant registration arrives. When it
          does, this page will be updated before the feature goes live,
          and it will say exactly what is kept and for how long.
        </p>

        <h2>What will be stored, once registration works</h2>
        <ul>
          <li>
            The name of the exchange, its dates, and its budget.
          </li>
          <li>
            For each participant: the name and email address they enter,
            anything they add to a wishlist, and the restrictions they
            set.
          </li>
          <li>
            Who was matched with whom, which is used to send each person
            their own recipient and is shown to nobody else, including
            the organizer.
          </li>
        </ul>
        <p>
          That is all of it. There is no reason for this site to know
          anything else about you, so it will not ask.
        </p>

        <h2>Email</h2>
        <p>
          Email addresses are used only to run the exchange you joined:
          an invitation, any reminders the organizer turned on, and your
          assignment on the draw date. No marketing, and no passing your
          address to anyone else. Every reminder will carry a link to
          stop receiving them.
        </p>

        <h2>Hosting</h2>
        <p>
          The site is served by GitHub Pages. Like any web host, GitHub
          records standard request information such as IP addresses in
          its own server logs. That is outside our control and is covered
          by GitHub&rsquo;s privacy policy.
        </p>

        <h2>Removing your information</h2>
        <p>
          Once there is something to remove, you will be able to ask for
          it. Until then there is nothing held about you. Either way,
          email{" "}
          <a href="mailto:contact@brainbenchapps.com">
            contact@brainbenchapps.com
          </a>{" "}
          and we will sort it out.
        </p>

        <p className="content-updated">
          Last updated 24 November 2026. Mystery Name Draw is part of
          Brain Bench Apps.
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
