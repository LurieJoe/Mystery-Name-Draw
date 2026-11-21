import "./Header.css";
type HeaderProps = {
    theme: string;
    setTheme: (theme: string) => void;
  };
  
  function Header({
    theme,
    setTheme,
  }: HeaderProps) {
    return (
      <header className="header">
        <div className="header-brand">
          Mystery Name Draw
        </div>
  
        <nav className="nav">
          <a href="#">Home</a>
          <a href="#">Quick Draw</a>
          <a href="#">FAQ</a>
          <a href="#">Help</a>
          <a href="#">Privacy</a>
        </nav>
  
        <div className="header-actions">
        {/*
<button
  className="theme-button"
  onClick={() =>
    setTheme(
      theme === "dark"
        ? "light"
        : "dark"
    )
  }
>
  {theme === "dark" ? "☀️" : "🌙"}
</button>
*/}
 <button className="start-exchange-button">
  Start a Gift Exchange
</button>

          <button className="signin-button">
            Sign In
          </button>
        </div>
      </header>
    );
  }
  
  export default Header;