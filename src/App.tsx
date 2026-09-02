import styled from "styled-components";
import { WebMCPProvider } from "webmcp-react";
import Gameboy from "./components/Gameboy";
import Game from "./components/Game";

import "./App.css";
import Paint from "./components/Paint";
import { PAINT_MODE } from "./app/constants";

const StyledApp = styled.div`
  background: black;
  width: 100vw;
  height: 100dvh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 5px;
  padding-bottom: 28px;

  @media (min-width: 1000px) {
    padding: 5px;
  }
`;

const App = () => {
  return (
    <WebMCPProvider name="pokemon-js" version="1.0.0">
      <StyledApp>
        <Gameboy>
          <Game />
          {PAINT_MODE && <Paint />}
        </Gameboy>
      </StyledApp>
    </WebMCPProvider>
  );
};

export default App;
