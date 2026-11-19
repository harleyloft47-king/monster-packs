# Monster Packs

A pack-opening card game: spin the ring of packs, tear one open and collect 500 monsters from myths, legends and folklore.

## Packs
Man-Eaters · Witches · Ghouls · Cursed Beasts · Spirits

## Features
- Pack ring you can drag or spin with the arrows
- Tear-to-open packs, 5 cards each, with Common, Rare and Legendary cards
- Legendary guaranteed within 30 packs, plus rare Blood Moon packs
- Free pack every 12 hours, coins, My Stash, selling duplicates and badges
- Inventory with My collection and Catalog views
- Coin Shop in **test mode**: no real money is charged

## Run it
It's a static site. Serve the folder with any web server, for example:

    python3 -m http.server 8000

then open http://localhost:8000. (Opening index.html directly from disk won't load the card data, because browsers block that.)

## Files
- `index.html`, `game.js`: the game
- `monsters.json`: all 500 cards (name, pack, rarity, lore, where its art is)
- `atlas/set1-5.webp`: card art, 100 cards per sheet (what the game loads)
- `cards/`: the individual card images the sheets are built from
- `packs/`: pack art
- `coin.webp`: the coin
- `fonts/`: Cinzel font (SIL Open Font License)

## Coin Shop
`SHOP_MODE` in `game.js` is `'test'`. Real payments would need a payment provider (for example Stripe) and a small server that confirms each payment before adding coins.
