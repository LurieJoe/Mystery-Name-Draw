/**
 * Shared across the landing, FAQ and privacy pages, so the links to
 * Brain Bench Apps and the sibling apps stay in one place.
 */
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <strong>Mystery Name Draw</strong>
          <span>
            Part of{" "}
            <a href="https://brainbenchapps.com">Brain Bench Apps</a>
          </span>
        </div>

        <nav
          className="site-footer-links"
          aria-label="Mystery Name Draw"
        >
          <a href="#/">Home</a>
          <a href="#/faq">FAQ</a>
          <a href="#/privacy">Privacy</a>
          <a href="#/quick">Quick Draw</a>
          <a href="#/create">Start an exchange</a>
        </nav>

        <nav className="site-footer-links" aria-label="Our other apps">
          <a href="https://flashcardflurry.com">Flashcard Flurry</a>
          <a href="https://geographygym.com">Geography Gym</a>
          {/* Lives inside Geography Gym rather than on a domain of its
              own, so the two sit together: listed apart they read as
              one app named twice. */}
          <a href="https://geographygym.com/mapdle/">Mapdle</a>
          <a href="https://analogmathclock.com">Analog Math Clock</a>
        </nav>
      </div>
    </footer>
  );
}
