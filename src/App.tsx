import "./CreateEventPage.css";
import { ExchangeProvider } from "./exchange/ExchangeProvider";
import LandingPage from "./pages/LandingPage";
import OrganizerPage from "./pages/OrganizerPage";
import RegisterPage from "./pages/RegisterPage";
import { matchEventCode, usePath } from "./router";

function App() {
  const route = usePath();
  const eventCode = matchEventCode(route);

  // The provider wraps every route, not just the wizard: navigating back
  // to the landing page would otherwise unmount it and lose a part-built
  // exchange.
  return (
    <ExchangeProvider>
      {eventCode ? (
        <RegisterPage eventCode={eventCode} />
      ) : route === "/create" ? (
        <OrganizerPage />
      ) : (
        <LandingPage />
      )}
    </ExchangeProvider>
  );
}

export default App;
