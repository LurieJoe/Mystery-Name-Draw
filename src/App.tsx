import "./CreateEventPage.css";
import { ExchangeProvider } from "./exchange/ExchangeProvider";
import OrganizerPage from "./pages/OrganizerPage";
import RegisterPage from "./pages/RegisterPage";
import { matchEventCode, usePath } from "./router";

function App() {
  const path = usePath();
  const eventCode = matchEventCode(path);

  return (
    <ExchangeProvider>
      {eventCode ? (
        <RegisterPage eventCode={eventCode} />
      ) : (
        <OrganizerPage />
      )}
    </ExchangeProvider>
  );
}

export default App;
