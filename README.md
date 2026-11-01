🎮 Twitch Nonogram Grid with Canvas 3.0 (Fixed)
A draggable nonogram puzzle overlay for Twitch streams, complete with canvas rendering, zoom controls, and nonogram solving mechanism 

📦 Features
🖼️ Draggable nonogram grid overlay

✍️ Interactive grid: left-click to fill, right-click to mark as empty. Left click on the clues to dash it as solved, right click to erase the line.

🔍 Zoom controls (−, +, 1×)

📋 "Export ✓" button sends or copies the next 15–24 selected cells (`!fill`, `!empty` and `!clear` combined) — the exact count is drawn at random for each message. Choose "Send 15–24 cells to chat" or "Copy 15–24 cells to clipboard" in ⚙️ Config. Each click moves on to the following block. Enable "Auto-send in blocks of 15–24 selected cells" to send automatically without clicking Export. "Reset export" forgets what was sent and queues the whole grid again.

🏁 Finishing the grid sends the rest immediately. When the last untouched cell is filled or marked empty — the grid is then complete — whatever is still waiting goes out as a final message, even if it is far fewer than 15 cells (e.g. a 4×4 grid sends its 16 cells as one message). The bot gets the final cells right away instead of waiting for a block that will never fill.

🧽 Erasing a cell that was already exported queues `!clear <cell>`, so the bot drops that cell instead of keeping the old mark. Every cell is exported with its latest state only: clearing a cell and then filling or emptying it again before the export sends just one entry, and if it ends up back at the state the bot already knows, nothing is sent for it.




🛠 Installation
Install Tampermonkey in your browser.

Build the userscript if you are working from source:

```bash
npm install
npm run build
```

The generated userscript is written to:

- `twitch-nonogram-canvas.user.js`

`twitch-nonogram-canvas.user.js` is generated from the files in `src/`. Edit the source modules and rebuild instead of editing the generated userscript directly.

Add a new userscript and paste in the code, or install the generated `.user.js` file directly.

Visit gokiccoon Twitch stream.

🧪 Development

Rebuild automatically while working on the source modules:

```bash
npm run build:watch
```

This watches the `src/` files and updates `twitch-nonogram-canvas.user.js` on changes.

🧾 How to Use
🔲 Grid Interaction
Left-click on a cell: Toggle black fill (█). A second click clears it.

Right-click: Toggle white mark (×). A second click clears it.

"Export ✓": Handles the next block of 15–24 newly filled/empty cells as `!fill a1 b2 ... !empty c3 ...`. The block size is drawn at random for every message, so consecutive messages never repeat the same length. In ⚙️ Config, choose whether a click **sends** that block to Twitch chat or **copies** it to the clipboard for manual pasting. Each click moves on to the following block.

"Auto-send in blocks of 15–24 selected cells" (⚙️ Config): sends a chat message automatically as soon as the current random block target is reached, without clicking Export.

"Reset export": Clears the sent-cell history and queues the whole grid again, so Export can send/copy it from the first block.

Changing grid size or column clue count clears the cells waiting to be sent.

⏱️ Chat pacing and rate limits
Messages are sent one at a time with a 10 second gap. A message only leaves the queue once Twitch did not reject it. If Twitch refuses it — slow mode ("This chat is running in slow mode. You’re sending messages too quickly.") or a plain "You are sending messages too quickly." — the same message stays at the front of the queue and is retried every 5 seconds until it goes through. Later coordinate blocks never jump ahead of it, and nothing has to be copied from chat by hand.

Any other message you send yourself in chat — `!darts`, tamagotchi commands, anything typed or sent with the chat button — is detected and counts as the chat slot: it delays the nonogram queue for one cooldown but never queues, starts or flushes nonogram messages.

While Twitch is blocking, the Export button tooltip shows `Twitch blocked the message — retry in Ns (N queued)`.

Zoom: Use − / + / 1× to adjust canvas scaling

🧩 Control Panel (right-side of grid)
Quick buttons to increase/decrease:

Grid size

Row/column clue count

Fine tune

Reset button to default layout (4x4 with 1 clue)

🧹 Troubleshooting
🖥️ No grid visible? Refresh the page, ensure you're on a matching URL (https://www.twitch.tv/goki*)

📋 Export not working? Ensure you are logged into Twitch chat and the message delay has passed. If Twitch rate-limits you, the queued blocks are retried automatically and the tooltip shows the remaining wait.


Special thanks for mr_pantera666 for ideas and coding, 86 maylin for the several pulls and for kurotaku for making his own code available (https://github.com/Kurotaku-sama/Userscripts/) 
