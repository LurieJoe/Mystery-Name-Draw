import CreateEventPage from "./CreateEventPage";

function App() {
  return <CreateEventPage />;
}

export default App;
const [theme, setTheme] = useState("dark");
document.documentElement.setAttribute(
  "data-theme",
  theme
);