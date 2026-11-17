# Ripper Skipper v2 — plan

Second take on the wakeboarding game. Look: realistic proportions and motion, drawn like a modern arcade fighter — flat cel tones, ink outlines, saturated colour.

## Done
- Physics (boat frame, 240 Hz): board as a lifting surface (edge = angle of attack → side force + induced drag), inextensible rope from the tower, surface-following with launch when the wake falls away faster than gravity, legs as suspension (stiff when cutting in or popping, soft otherwise, so the wake is absorbed rather than bounced off), loaded pop, ballistic air with rope pull, landing checks (roll and heading), wipeouts (slap down, a short tumble, under the water, float back up with the board) and respawn.
- Tricks: spins (180s, frontside/backside), back/front rolls incl. named combos (Roll to Revert, Mobius, Scarecrow, …), four grabs, Air Raley, Tantrum (Tantrum to Blind, Whirlybird), switch stance, wake-to-wake, clean-landing bonus, combo multiplier with repeat penalty.
- Rendering: toon ramp + rim light, ink lines from a normal/id/depth pass, MSAA colour pass, adaptive resolution.
- Water: wake ridges, prop wash, cellular foam, rider trail, blob shadows, sparkle; sky with toon clouds and far mountains; scrolling shore, pines, cabins, docks.
- Rider and boat built in code; rider posed by IK every frame (heel/toe lean, crouch and pop, tuck, grabs, one-hand when the rope is behind the back, ragdoll-ish wipeout).
- Title/attract mode, deep-water start for wakeboard runs, 2-minute run, results, best score in localStorage, synthesised sound effects and music, slow-motion and underwater muffling on a wipeout, trick feedback that scales with the size of the move (stars, flash, fanfare; rays only for big moves, full-screen for huge ones).
- Wakesurf mode, chosen on the title screen: slower boat, one big wave close behind it, no rope, bare feet on a loose board. Staying in the pocket is the game — the board slides down the face and tricks cost position; fall off the back and the wave is lost. Ollies, air 180s, grabs, shove-its, surface 180/360s, points per second on the wave, the board thrown clear in a fall.
- On the boat: the Stars and Stripes on a pole above the tower (limp at rest, streaming once under way), and the spotter raises an orange flag while the rider is in the water.
- Shared leaderboard: the best ten per mode in D1 behind a small Worker API; a top-ten run asks for a name.
- XP and unlocks: every point adds to a total kept in the browser. It unlocks tricks (the Air Raley after a first run, then the Tantrum and three new ones: the Stalefish grab, the Hoochie Glide and the S-Bend), boats with their own models (a pontoon party barge, a mahogany runabout, the X-Star and the G23) and lakes with their own shores and skies — made-up ones (a tropical cove at sunset, a city at night) and real ones with their landmarks (Lake Tahoe, San Francisco Bay with the Golden Gate, Lake Havasu with London Bridge, Lake Washington with Seattle and Rainier). Also two bigger speaker systems for the tower, each with its own song; the Mute grab, and 720s and double rolls (faster spins and rolls) as late unlocks. Each has an icon that is dim while locked and flashes on when earned; a locker after each run to choose speakers, boat and lake.
- Esc in a run stops it and asks whether to exit (Y / N).
- Phones and tablets: a thumb stick and buttons, menus to tap, everything scaled to fit, a prompt to turn the phone sideways.
- Feel: the boat heels and its engine labours under a hard cut; the crew watch and cheer; the rope jolts as it loads up after a landing and throws spray where it drags; the rider spots the landing, hair and strap ends move, flat landings buckle the knees.
- Wakesurf landings made forgiving: the board squares itself up to the nearest clean landing; only nearly sideways is a fall.
- Live at https://www.ripperskipper.com (`npm run deploy`).

## Ideas, not started
- Rider: face and hair detail for close-ups, a second rider.
- Unlocks: more tricks to earn, XP that follows the player across browsers, things on the water to go round (buoys, other boats) per lake.
- Tricks: tantrum/flip axis, handle-pass animation, rails/kickers on a course.
- Feel: slow-motion on big airs, replay camera, rumble on gamepad; gamepad input.
- Surf: a way to win position back (pumping), lip slides, the boat listing to the surf side, a goofy-foot / port-side wave.
- World: other boats, time-of-day variants, shoreline variety.
- Site: the bare domain `ripperskipper.com` (only `www` is set up).
