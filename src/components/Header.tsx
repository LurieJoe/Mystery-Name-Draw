import "./Header.css";
type HeaderProps = {
  theme: string;
  setTheme: (theme: string) => void;
  onStartExchange: () => void;
};
  
function Header({
  theme,
  setTheme,
  onStartExchange,
}: HeaderProps) {
    return (
      <header className="header">
        <div className="header-brand">
          Mystery Name Draw
        </div>
  
        <nav className="nav">
          <a href="#">Home</a>
          <a href="#">FAQ</a>
          <a href="#">Help</a>
          <a href="#">Privacy</a>
        </nav>
  
        <div className="header-actions">
        <button
          className="theme-button"
          onClick={() =>
            setTheme(theme === "dark" ? "light" : "dark")
          }
          title="Toggle light / dark theme"
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
 <button
  className="start-exchange-button"
  onClick={onStartExchange}
>
  Start a Gift Exchange
</button>

<button className="quick-draw-button">
    Create a Quick Draw
  </button>

          <button className="signin-button">
            Sign In
          </button>
        </div>
      </header>
    );
  }
  
  export default Header;