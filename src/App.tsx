import Terminal from "./components/Terminal";

function App() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        "flex-direction": "column",
        overflow: "hidden",
        background: "#000",
      }}
    >
      <Terminal />
    </div>
  );
}

export default App;
