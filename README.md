# Pokemon JS

A recreation of the classic Pokemon Red/Blue games built with React and TypeScript. This project aims to recreate the original Pokemon experience in the browser, maintaining the authentic feel while leveraging modern web technologies.

<img width="1675" alt="image" src="https://github.com/user-attachments/assets/7fc7324f-a0cb-4da1-b6a7-3f3941b39117" />

## What is new here (WebMCP Challenge)

This repository is a fork. The Pokemon Red/Blue recreation underneath it is
[chase-mew/pokemon-js](https://github.com/chase-mew/pokemon-js) by Chase
Manning, MIT licensed, and its last upstream commit is `e3bbb53` from
**2025-06-13**. Everything below was added for the challenge, from `cb34b6a`
onwards, and the commit dates are the evidence:

| What | Where |
| --- | --- |
| The WebMCP tool surface: 13 tools over `document.modelContext` | `src/webmcp/` |
| Agent-shaped reads: ASCII local map, notable tiles, battle and menu state | `src/webmcp/snapshot.ts` |
| BFS pathfinding over the reducers' own walkability rules | `src/webmcp/pathfinding.ts` |
| One shared world: actions broadcast over Supabase Realtime, driver election, room-as-save-file | `src/state/session.ts` |
| Battle state lifted out of component state so every agent watches the same fight | `src/state/battleSlice.ts` |
| Menu mirroring, so a tool can read the cursor and pick an entry by label | `src/app/use-menu-registration.ts` |
| Tests for the agent-facing behaviour | `src/webmcp/webmcp.test.ts` |

```bash
git log --format='%ad %h %s' --date=short   # the boundary is visible in one command
```

Nothing in the original game logic (maps, battle mechanics, sprites, music) is
our work; the WebMCP layer, the shared-world layer and the agent-facing state
are.

## Features

- 🎮 Classic Pokemon gameplay mechanics
- 🗺️ Multiple maps and locations from the original games
- ⚔️ Turn-based battle system
- 🎵 Original game music and sound effects
- 📱 Responsive design with GameBoy-style interface
- 💾 Save/Load game functionality
- 🏪 PokeMart and Pokemon Center implementations
- 📦 Item and inventory system
- 🎯 Trainer battles
- 🌿 Wild Pokemon encounters
- 📱 Mobile-friendly controls

## Tech Stack

- React 18
- TypeScript
- Redux Toolkit for state management
- Styled Components for styling
- Firebase for hosting
- [webmcp-react](https://github.com/agentcathq/webmcp-react) to expose the game to AI agents
- Supabase Realtime for the shared world

## Playing it with agents

People and agents play the *same* avatar, at the same time, in the same world.
A human presses the on-screen Game Boy buttons; an agent calls the same events
through [WebMCP](https://github.com/agentcathq/webmcp-react) tools exposed on
`document.modelContext`. Neither is a second-class citizen: there is one
trainer, one party, one battle, and whoever acts next moves it.

Open the page in ChatGPT's in-app browser, or in Chrome with
`chrome://flags/#enable-webmcp-testing` enabled, and the tools below are
available with no extension or setup.

| Tool | What it does |
| --- | --- |
| `get_game_state` | Position, party, bag, what is on screen, and an ASCII map of the surrounding tiles |
| `look` | Just the surroundings: the ASCII map plus doors, people and items with absolute coordinates |
| `walk_to` | Pathfind to a tile, stopping early on encounters and doors |
| `walk` | Step in one direction; walking into something turns you to face it |
| `interact` | Press A: talk, read signs, advance dialogue |
| `go_to_and_interact` | Walk up to an NPC or sign, face it, talk to it |
| `select_menu_item` | Choose a menu entry by label, including which Pokemon to send out |
| `swap_party_slots` | Reorder the party, so who leads is chosen without burning a turn |
| `press_button` | Raw Game Boy button, for anything else |
| `wait` | Let animations and transitions finish |
| `get_party_agents` | Who else is in this world, and their recent notes |
| `tell_agents` | Leave a note for the other agents |
| `save_room` | Flush the shared world to the database immediately |

### One world, many agents

Copy `.env.example` to `.env` and fill in a Supabase project (Realtime only, no
tables and no auth needed). Every tab that joins the same room drives the **same
trainer**: game actions are broadcast to the room and applied everywhere, and a
tab joining a game in progress is handed the current world by whoever is already
playing.

```bash
cp .env.example .env   # add your Supabase URL and anon key
supabase link --project-ref <your-project-ref>
supabase db push       # creates the rooms table
yarn start
```

Open the game in one tab per agent, optionally with `?room=<name>` to run
several worlds at once. With the keys unset everything still works, the tab is
just not synced to anyone.

The `game` and `battle` slices travel between tabs, so battles are shared too:
every agent watches the same fight and any of them can take the turn. Menus and
dialogue position stay per-agent, so two agents can be reading different screens
of the same world.

### Saving

The room *is* the save file. The driver writes the world to a `rooms` row a
couple of seconds after anything changes, and a tab that joins a room nobody is
playing restores from there - so a world survives everyone disconnecting. Live
peers always win over the database, so joining a room in progress catches you up
to what is happening now rather than to the last write.

`Start -> Save` and the `save_room` tool just flush immediately; there is
nothing you have to remember to do. Without Supabase configured the game falls
back to the original per-browser `localStorage` save.

The migration in `supabase/migrations` leaves the `rooms` table readable and
writable by `anon` on purpose: anyone who can load the game can join any room by
name. Do not keep anything private in it.

One tab is elected **driver** (the oldest in the room) and is the only one that
runs the world's emergent logic - wild encounter rolls, battle choreography
timers, map transitions. Without that, every tab would roll its own Pokemon and
broadcast its own map change. The election is derived from presence, so it needs
no coordination and hands over on its own when the driver leaves.

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- Yarn package manager

### Installation

1. Clone the repository:

```bash
git clone https://github.com/qchuchu/pokemon-js-webmcp.git
cd pokemon-js-webmcp
```

2. Install dependencies:

```bash
yarn install
```

3. Start the development server:

```bash
yarn start
```

The game will be available at `http://localhost:3000`

## Controls

| Key | Button |
| --- | --- |
| Arrows, or `WASD` | D-pad |
| `Enter` or `Z` | A |
| `Shift`, `X` or `Backspace` | B |
| `Space` | Start |
| `Esc` | Select |

The on-screen Game Boy is live too: click or hold the D-pad, tap A, B, Start
and Select. Keys, buttons and the WebMCP tools all emit the same events, which
is what lets a person and an agent share one avatar - you can take a turn in a
battle an agent is fighting, and it will read the result on its next call.

Opening the page drops you straight into the running world - there is no boot
or title sequence to click through. A badge in the top right shows how many
agents are currently connected to the room.

## Project Structure

- `/src/components`: React components for game UI
- `/src/maps`: Game map data and configurations
- `/src/state`: Redux store and state management
- `/src/assets`: Game assets (sprites, music, etc.)
- `/src/styles`: Global styles and theme configurations

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Special thanks to

- [darkmurkrow YouTube channel](https://www.youtube.com/@darkmurkrow) for uploading playthroughs of the game used for reference
- [Brandon Smith](https://www.brandons.me/) for creating the [Gameboy Codepen](https://codepen.io/brundolf/pen/beagbQ) used for the mobile view
- [luttje](https://github.com/luttje) for creating the [Pokemon GameBoy CSS](https://github.com/luttje/css-pokemon-gameboy/tree/main) used for some styling
- [The Spriters Resource](https://www.spriters-resource.com/game_boy_gbc/pokemonredblue/) for uploading sprites and assets used
- [Video Game Music](https://downloads.khinsider.com/game-soundtracks/album/pokemon-game-boy-pok-mon-sound-complete-set-play-cd) for uploading the music and sounds used
- [Strategy Wiki](https://strategywiki.org/wiki/Pok%C3%A9mon_Red_and_Blue/Walkthrough) for uploading information on trainers, maps and items

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This is a fan-made project and is not affiliated with or endorsed by Nintendo, Game Freak, or The Pokemon Company. All Pokemon-related content is property of their respective owners.

## Deployment

Live at **https://pokemon-js-production.up.railway.app**

Deployed to Railway as a static site. Railpack builds with `yarn build` and
serves `build/` with Caddy, configured entirely through service variables:

| Variable | Why |
| --- | --- |
| `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY` | Baked into the bundle at build time, not read at runtime |
| `RAILPACK_STATIC_FILE_ROOT=build` | Tells Railpack to serve the CRA output statically |
| `RAILPACK_NODE_VERSION=22` | `@supabase/supabase-js` requires Node >= 22 |
| `CI=false` | Railway sets `CI=true`, which makes `react-scripts build` fail on warnings |

There is deliberately no service worker. The CRA precache served the app shell
cache-first, so a deploy never reached anyone still holding the previous bundle
until they cleared their caches by hand. A world shared over the network is
worse off stale than offline, so `src/index.tsx` calls `unregister()`, which
removes the worker and its caches from clients that already installed one.

```bash
railway up --service pokemon-js -m "<summary>"
```
