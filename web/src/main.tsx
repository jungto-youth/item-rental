import "@fontsource-variable/noto-sans-kr";
import "./styles/tokens.css";
import "./styles/app.css";
import { render } from "@solidjs/web";
import { Shell } from "./components/layout";
import { setUnauthorizedHandler } from "./api/client";
import { session } from "./context/session";
import { navigate } from "./router";

let handlingUnauthorized = false;
setUnauthorizedHandler(() => {
  if (handlingUnauthorized || !session.user()) return;
  handlingUnauthorized = true;
  void session.refresh().finally(() => {
    handlingUnauthorized = false;
    if (!session.user() && window.location.pathname !== "/login") navigate("/login");
  });
});

render(() => <Shell />, document.getElementById("root")!);
