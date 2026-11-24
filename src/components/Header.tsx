import "./Header.css";
type HeaderProps = {
  onStartExchange: () => void;
};
  
function Header({
  onStartExchange,
}: HeaderProps) {
    return (
      <header className="header">
        <div className="header-brand">
          Mystery Name Draw
        </div>
  
        <nav className="nav">
          <a href="#/">Home</a>
          {/*
            FAQ, Help and Privacy have no pages yet. Left out rather
            than pointed at "#", which now routes to the landing page
            and would discard a part-built exchange.
          */}
        </nav>
  
        <div className="header-actions">
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