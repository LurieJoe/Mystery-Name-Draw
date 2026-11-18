import "./App.css";

function App() {
  return (
    <div className="app">

      <header className="header">
        <div className="header-brand">
          Mystery Name Draw
        </div>

        <nav className="nav">
          <a href="#">Home</a>
          <a href="#">Create Event</a>
          <a href="#">Join Event</a>
          <a href="#">FAQ</a>
          <a href="#">Help</a>
          <a href="#">Privacy</a>
        </nav>

        <div className="header-actions">
          <button className="theme-button">
            🌙
          </button>

          <button className="signin-button">
            Sign In
          </button>
        </div>
      </header>

      <section className="hero">

        <div className="hero-content">

          <p className="eyebrow">
            PRIVACY FIRST GIFT EXCHANGES
          </p>

          <h1>
            Mystery Name Draw
          </h1>

          <p className="hero-text">
            Create anonymous exchanges without
            spreadsheets, manual drawings,
            or organizers seeing assignments.
          </p>

          <div className="actions">
            <button>Create Event</button>
            <button>Join Event</button>
          </div>

        </div>

        <div className="hero-image">
          <img
            src="/images/logo-primary-v1.png"
            alt="Mystery Name Draw Logo"
          />
        </div>

      </section>
      <section className="features">

<div className="feature-card">
  <div className="feature-icon">🔒</div>

  <h3>Privacy First</h3>

  <p>
    Organizers never see assignments.
    Participants control their own information.
  </p>
</div>

<div className="feature-card">
  <div className="feature-icon">👥</div>

  <h3>Flexible Events</h3>

  <p>
    Perfect for families, offices, holiday parties
    clubs, classrooms, and community groups.
  </p>
</div>

<div className="feature-card">
  <div className="feature-icon">📝</div>

  <h3>Thoughtful Exchanges</h3>

  <p>
    Supports wishlists, interests,
    and participant exclusions.
  </p>
</div>

</section>
<footer className="footer">

  <div className="footer-left">
    © 2026 Mystery Name Draw
  </div>

  <div className="footer-right">
    <a href="#">Brain Bench Apps</a>
    <a href="#">FAQ</a>
    <a href="#">Help Center</a>
    <a href="#">Send Feedback</a>
    <a href="#">Privacy</a>
  </div>

</footer>
    </div>
  );
}

export default App;