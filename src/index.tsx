import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "./state/store";
import App from "./App";
import GlobalStyles from "./styles/GlobalStyles";

import * as serviceWorkerRegistration from "./serviceWorkerRegistration";

const container = document.getElementById("root")!;
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <Provider store={store}>
      <GlobalStyles />
      <App />
    </Provider>
  </React.StrictMode>
);

// Not register(): the precache served the app shell cache-first, so a deploy
// never reached anyone still holding the old bundle. This removes the worker
// and its caches from clients that already have it.
serviceWorkerRegistration.unregister();
