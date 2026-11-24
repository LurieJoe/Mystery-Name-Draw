import "./CreateEventPage.css";
import { ExchangeProvider } from "./exchange/ExchangeProvider";
import FaqPage from "./pages/FaqPage";
import LandingPage from "./pages/LandingPage";
import OrganizerPage from "./pages/OrganizerPage";
import PrivacyPage from "./pages/PrivacyPage";
import QuickDrawPage from "./pages/QuickDrawPage";
import RegisterPage from "./pages/RegisterPage";
import { matchEventCode, usePath } from "./router";

function App() {
  const route = usePath();
  const eventCode = matchEventCode(route);

  // The provider wraps every route, not just the wizard: navigating away
  // and back would otherwise unmount it and lose a part-built exchange.
  return (
    <ExchangeProvider>
      {eventCode ? (
        <RegisterPage eventCode={eventCode} />
      ) : route === "/create" ? (
        <OrganizerPage />
      ) : route === "/quick" ? (
        <QuickDrawPage />
      ) : route === "/faq" ? (
        <FaqPage />
      ) : route === "/privacy" ? (
        <PrivacyPage />
      ) : (
        <LandingPage />
      )}
    </ExchangeProvider>
  );
}

export default App;
