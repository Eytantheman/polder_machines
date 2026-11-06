# Polder machines

Animated 3D reconstructions of Dutch water-management machines, made from technical drawings in the Provinciale Atlas Noord-Holland (Noord-Hollands Archief, collection 122: *Technische tekeningen*). Each machine sits in its own water landscape. Around and behind it, moving assets mix nature, pollution, 19th-century technology and contemporary technology.

| Machine | Landscape | Drawing | Viewer |
|---|---|---|---|
| Vijzel-staartmolentje, Monnickendam 1826 | Polder | inv. 159 (drawn 1836) | [monnickendam-1826/](monnickendam-1826/) |
| Scheprad watermolen, Schermerhorn 1816 | Polder (Beemster / Schermer boezem) | inv. 307, F. Schoorl | [schermerhorn-1816/](schermerhorn-1816/) |
| Stoomwerktuig De Leeghwater, 1843 | Lake (Haarlemmermeer) | inv. 96, Kaart III | [leeghwater-1843/](leeghwater-1843/) |
| Zeesluis, Muiden 1811–1812 | Sea (Zuiderzee / Vecht) | inv. 359 | [muiden-zeesluis/](muiden-zeesluis/) |
| Noorder Valdeursluis, Zaandam | Canal (Zaan) | inv. 271 | [zaandam-valdeursluis/](zaandam-valdeursluis/) |
| Middelste watermolen, Buitenveldert 1836 | Polder at the city's edge (now Zuidas) | inv. 377, J. Maurik | [buitenveldert-1836/](buitenveldert-1836/) |

## What moves

- **Machines:**
  - The windmills respond to a wind-speed slider and spin up with eased inertia.
  - The steam engine's speed is set by steam pressure.
  - The locks run a full passage cycle, which you can also trigger by hand.
- **Nature:** cows, herons, a stork on its nest, swans, ducks, coots, geese, seals, a returning beaver, jumping fish, bird flocks, and a whale on the Zuiderzee.
- **Old technology:** botters, tjalken, a horse-drawn trekschuit, a horse cart, and the windmills of the Zaan and the polders.
- **Contemporary technology:** wind turbines (on land and offshore), solar fields, data centres, the A10 and the metro, intercity trains, Zuidas towers and cranes, aircraft landing at Schiphol, parcel drones, kitesurfers, jet skis, a container ship, a tour boat and an autonomous Roboat.
- **Pollution:** oil sheen, drifting plastic and bottles, foam, coal smoke, cocoa-factory smoke, manure spraying, and rental scooters dumped in the canal.

## Structure

- `common/engine.js`: renderer, sky, reflective water bodies, panel, metadata overlay, navigation, and the ambient life shared by every page.
- `common/assets.js`: the procedural props.
- `common/mill.js`: the octagonal smock mill used on the Schermerhorn and Buitenveldert pages.
- `common/lock.js`: the step sequencer for the lock cycles.
- Each folder's `index.html` builds its machine and landscape.

The pages need no build step. They load three.js from jsDelivr. Add `?speed=10` to a URL to fast-forward the simulation. The Monnickendam folder also holds the Blender model and its build scripts.

## Notes on the reconstructions

The models are interpretive. They are built from the drawings' proportions and known typologies, not from measured surveys.

- **Speeds and gearing:** rotation speeds, gear ratios and discharges are illustrative.
- **Landscapes:** water levels and surroundings are simplified.
- **Whale:** the whale is a deliberate anachronism.

The source drawings are in the public domain. Links to the archive records are in each viewer.
