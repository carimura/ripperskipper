// What XP unlocks: every point scored, in either mode, over every run adds to a total kept in this browser.
// `at` is the XP an item needs (0: there from the start); `first` unlocks by finishing a run, whatever it scored.
// The boats are modelled in boat.js and the lakes in env.js, in this order; the speakers are on the boats, their songs in music.js. `icon` is drawn in a 64 × 64 box, inked like the game.
const sea = c => `<path d="M0 50c6-5 10-5 16 0s10 5 16 0 10-5 16 0 10-5 16 0v14H0z" fill="${c}"/>`;
export const GEAR = {
  trick: [
    { name: 'AIR RALEY', first: true, how: 'HOLD E IN THE AIR', icon: `<rect width="64" height="64" fill="#58b4f5"/>${sea('#1778c2')}
      <path d="M3 33h17" stroke="#d8ff2a" stroke-width="3"/><rect x="42" y="4" width="8" height="30" rx="4" transform="rotate(24 46 19)" fill="#ffd21f"/>
      <path d="M21 33l10 3 15-13" fill="none" stroke-width="11"/><path d="M21 33l10 3 15-13" fill="none" stroke="#8e6ccb" stroke-width="6"/><circle cx="29" cy="26" r="6" fill="#f2b98a"/>` },
    { name: 'TANTRUM', at: 15000, how: 'HOLD Q IN THE AIR', icon: `<rect width="64" height="64" fill="#ff7a18"/>${sea('#c8102e')}
      <path d="M52 36a21 21 0 1 1-8-23" fill="none" stroke-width="9"/><path d="M52 36a21 21 0 1 1-8-23" fill="none" stroke="#fff" stroke-width="4"/><path d="M48 6l6 14-14-1z" fill="#fff"/>
      <g transform="rotate(-14 32 29)"><rect x="21" y="14" width="20" height="7" rx="3.5" fill="#ffd21f"/>
      <path d="M26 21l5 10 6-10" fill="none" stroke-width="10"/><path d="M26 21l5 10 6-10" fill="none" stroke="#8e6ccb" stroke-width="5"/><circle cx="31" cy="39" r="5.5" fill="#f2b98a"/></g>` },
    { name: 'STALEFISH', at: 30000, how: 'HOLD F IN THE AIR', icon: `<rect width="64" height="64" fill="#19c6b4"/>${sea('#0e7a8c')}
      <rect x="14" y="36" width="36" height="8" rx="4" transform="rotate(-16 32 40)" fill="#ffd21f"/>
      <path d="M25 40l6-13 11 8" fill="none" stroke-width="10"/><path d="M25 40l6-13 11 8" fill="none" stroke="#2a9bd8" stroke-width="5"/><path d="M31 27l3-9" fill="none" stroke-width="11"/><path d="M31 27l3-9" fill="none" stroke="#8e6ccb" stroke-width="6"/>
      <path d="M34 20c-12 2-16 10-15 21" fill="none" stroke-width="8"/><path d="M34 20c-12 2-16 10-15 21" fill="none" stroke="#f2b98a" stroke-width="3"/><circle cx="37" cy="12" r="6" fill="#f2b98a"/>` },
    { name: 'HOOCHIE GLIDE', at: 60000, how: 'HOLD E + A GRAB', icon: `<rect width="64" height="64" fill="#ff4fa0"/>${sea('#a82a8c')}
      <path d="M3 33h17" stroke="#d8ff2a" stroke-width="3"/><rect x="40" y="8" width="8" height="28" rx="4" transform="rotate(50 44 22)" fill="#ffd21f"/>
      <path d="M21 33l11 3 10-6 3-9" fill="none" stroke-width="11"/><path d="M21 33l11 3 10-6 3-9" fill="none" stroke="#8e6ccb" stroke-width="6"/>
      <path d="M31 34c2-9 8-13 16-12" fill="none" stroke-width="8"/><path d="M31 34c2-9 8-13 16-12" fill="none" stroke="#f2b98a" stroke-width="3"/><circle cx="28" cy="26" r="6" fill="#f2b98a"/>` },
    { name: 'S-BEND', at: 150000, how: 'HOLD R IN THE AIR', icon: `<rect width="64" height="64" fill="#6a3a8c"/>${sea('#3a2a8c')}
      <path d="M3 30h15" stroke="#d8ff2a" stroke-width="3"/><rect x="48" y="14" width="8" height="30" rx="4" fill="#ffd21f"/>
      <path d="M19 30h31" fill="none" stroke-width="11"/><path d="M19 30h31" fill="none" stroke="#8e6ccb" stroke-width="6"/><circle cx="23" cy="22" r="6" fill="#f2b98a"/>
      <path d="M40 12a9 19 0 1 0 6 3" fill="none" stroke-width="8.5"/><path d="M40 12a9 19 0 1 0 6 3" fill="none" stroke="#fff" stroke-width="3.5"/><path d="M40 5l9 8-11 5z" fill="#fff"/>` },
    { name: 'MUTE', at: 45000, how: 'HOLD C IN THE AIR', icon: `<rect width="64" height="64" fill="#ff7a18"/>${sea('#c8102e')}
      <rect x="14" y="38" width="36" height="8" rx="4" transform="rotate(14 32 42)" fill="#ffd21f"/>
      <path d="M38 42l-6-13-11 7" fill="none" stroke-width="10"/><path d="M38 42l-6-13-11 7" fill="none" stroke="#2a9bd8" stroke-width="5"/><path d="M32 29l-3-9" fill="none" stroke-width="11"/><path d="M32 29l-3-9" fill="none" stroke="#8e6ccb" stroke-width="6"/>
      <path d="M30 21c11 3 14 11 12 21" fill="none" stroke-width="8"/><path d="M30 21c11 3 14 11 12 21" fill="none" stroke="#f2b98a" stroke-width="3"/><circle cx="27" cy="13" r="6" fill="#f2b98a"/>` },
    { name: '720', at: 220000, how: 'FASTER SPINS', icon: `<rect width="64" height="64" fill="#1466d6"/>
      <path d="M52 22a22 22 0 1 0 2 16" fill="none" stroke-width="9"/><path d="M52 22a22 22 0 1 0 2 16" fill="none" stroke="#fff" stroke-width="4"/><path d="M57 13l-1 15-13-6z" fill="#fff"/>
      <text x="32" y="40" text-anchor="middle" font-family="Impact, sans-serif" font-size="21" font-style="italic" fill="#ffd21f" stroke-width="2" paint-order="stroke">720</text>` },
    { name: 'DOUBLE ROLL', at: 350000, how: 'FASTER ROLLS', icon: `<rect width="64" height="64" fill="#2a1a5c"/>${sea('#6a3a8c')}
      <path d="M23 40a11 13 0 1 1 9-18" fill="none" stroke-width="8.5"/><path d="M23 40a11 13 0 1 1 9-18" fill="none" stroke="#ff4fd8" stroke-width="3.5"/><path d="M41 40a11 13 0 1 1 9-18" fill="none" stroke-width="8.5"/><path d="M41 40a11 13 0 1 1 9-18" fill="none" stroke="#5fe3ff" stroke-width="3.5"/>
      <path d="M28 14l8 7-10 4z" fill="#ff4fd8"/><path d="M46 14l8 7-10 4z" fill="#5fe3ff"/>` },
  ],
  speaker: [
    { name: 'STOCK STEREO', at: 0, icon: `<rect width="64" height="64" fill="#8f9bb0"/><rect x="17" y="8" width="30" height="48" rx="5" fill="#20242e"/>
      <circle cx="32" cy="39" r="10" fill="#cfd8e6"/><circle cx="32" cy="39" r="4" fill="#20242e"/><circle cx="32" cy="19" r="4.500" fill="#cfd8e6"/>` },
    { name: 'BASS CANNONS', at: 450000, how: 'BIG BOOM BASS', icon: `<rect width="64" height="64" fill="#15171f"/>
      <path d="M4 12c4-5 9-7 14-7M60 12c-4-5-9-7-14-7M26 8h12" fill="none" stroke="#ffd21f" stroke-width="3"/>
      <circle cx="19" cy="38" r="15" fill="#20242e" stroke="#ff4fd8" stroke-width="4"/><circle cx="19" cy="38" r="8" fill="#cfd8e6"/><circle cx="19" cy="38" r="3" fill="#20242e"/>
      <circle cx="46" cy="38" r="15" fill="#20242e" stroke="#5fe3ff" stroke-width="4"/><circle cx="46" cy="38" r="8" fill="#cfd8e6"/><circle cx="46" cy="38" r="3" fill="#20242e"/>` },
    { name: 'DISCO STACK', at: 200000, how: 'A NEW SONG', icon: `<rect width="64" height="64" fill="#3a2a8c"/><path d="M4 12c4-5 9-7 14-7M60 12c-4-5-9-7-14-7M26 8h12" fill="none" stroke="#ff4fd8" stroke-width="3"/>
      <circle cx="19" cy="38" r="15" fill="#20242e" stroke="#ffd21f" stroke-width="4"/><circle cx="19" cy="38" r="8" fill="#cfd8e6"/><circle cx="19" cy="38" r="3" fill="#20242e"/>
      <circle cx="46" cy="38" r="15" fill="#20242e" stroke="#7dff3a" stroke-width="4"/><circle cx="46" cy="38" r="8" fill="#cfd8e6"/><circle cx="46" cy="38" r="3" fill="#20242e"/>` },
  ],
  boat: [
    { name: 'SKIPPER', at: 0, icon: `<rect width="64" height="64" fill="#cfeeff"/>
      <path d="M37 37l-5-22h17l5 22h-6l-3-16h-7l3 16z" fill="#20242e"/><path d="M19 37l5-9h8l1 9z" fill="#2a5a9c"/>
      <path d="M3 34l9 3h49v12H14z" fill="#f7f9fd"/><path d="M8 43h53v6H14z" fill="#e8262e"/>${sea('#1778c2')}` },
    { name: 'PARTY BARGE', at: 100000, icon: `<rect width="64" height="64" fill="#ffe9c4"/>
      <path d="M16 39V17M52 39V17" stroke-width="3"/><path d="M10 12h48v7H10z" fill="#19c6b4"/><path d="M20 12v7M30 12v7M40 12v7M50 12v7" stroke="#fff" stroke-width="5"/>
      <path d="M7 30h52v9H7z" fill="#ff4fa0"/><path d="M7 39h54v5H7z" fill="#f7f9fd"/><path d="M4 49a5 5 0 0 1 5-5h51v10H9a5 5 0 0 1-5-5z" fill="#cfd8e6"/>${sea('#12a0a0')}` },
    { name: 'WOODY', at: 300000, icon: `<rect width="64" height="64" fill="#ffd08a"/>
      <path d="M37 37l6-22h6l4 22" fill="none" stroke-width="6.5"/><path d="M37 37l6-22h6l4 22" fill="none" stroke="#cfd8e6" stroke-width="2.5"/>
      <path d="M22 37l7-8h5v8z" fill="#bdf3ff"/><path d="M2 35c14 0 22 2 30 2h29l-2 12H15C9 46 5 41 2 35z" fill="#8a3b1c"/><path d="M11 45h49l-1 4H15z" fill="#f3e7cf"/>${sea('#6a3a8c')}` },
    { name: 'X-STAR', at: 750000, icon: `<rect width="64" height="64" fill="#ffd21f"/>
      <path d="M33 37c0-12 2-21 8-22h10l4 22" fill="none" stroke-width="8.5"/><path d="M33 37c0-12 2-21 8-22h10l4 22" fill="none" stroke="#20242e" stroke-width="3.5"/><path d="M20 37l6-10h9l-2 10z" fill="#2a5a9c"/>
      <path d="M3 33l8 4h50v12H13z" fill="#15171f"/><path d="M30 49l31-10v10z" fill="#b6ff1a"/>${sea('#1778c2')}` },
    { name: 'G23', at: 500000, icon: `<rect width="64" height="64" fill="#bdf3ff"/>
      <path d="M34 37l10-23h17l-3 6H48l-5 17z" fill="#20242e"/><path d="M19 37l7-10h8v10z" fill="#2a5a9c"/>
      <path d="M2 30c6 3 9 7 14 7h45v12H14C8 44 4 37 2 30z" fill="#e8ecf2"/><path d="M8 40c14 3 30 3 53-3v6c-20 5-36 5-50 2z" fill="#ff6a00"/>${sea('#1466d6')}` },
  ],
  lake: [
    { name: 'PINE LAKE', at: 0, icon: `<rect width="64" height="64" fill="#58b4f5"/>
      <path d="M-2 46l22-30 12 16 8-8 26 22z" fill="#7da3e0"/><path d="M13 26l7-10 6 8-4 3-3-3z" fill="#fff"/><path d="M-2 40h68v10H-2z" fill="#5aa648"/>
      <path d="M44 50V40M34 40l10-12 10 12zM36 30l8-11 8 11zM38 21l6-9 6 9z" fill="#2f7a4a"/>${sea('#1778c2')}` },
    { name: 'LAKE TAHOE', at: 40000, icon: `<rect width="64" height="64" fill="#3a8ae8"/>
      <path d="M-2 48l18-30 10 12 9-14 31 32z" fill="#f6f7fb"/><path d="M-2 48l12-20 8 10 7-6 10 16z" fill="#2f7a4a"/><path d="M44 34l10 14H36z" fill="#2f7a4a"/>${sea('#1668c8')}
      <circle cx="15" cy="51" r="8" fill="#d9dde4"/><circle cx="29" cy="54" r="6" fill="#b9bec8"/>` },
    { name: 'SAN FRANCISCO BAY', at: 90000, icon: `<rect width="64" height="64" fill="#9fd0f0"/><path d="M-2 40c10-6 18-4 26-1s16 2 22-2 14-3 20 0v8H-2z" fill="#f6f7fb"/>
      <path d="M-2 36c12-1 18 11 30 13M28 49c12-2 18-14 30-13M58 36c4 0 6 3 8 5" fill="none" stroke="#c0362c" stroke-width="2.500"/>
      <path d="M14 52V14M22 52V14" fill="none" stroke-width="6.500"/><path d="M14 52V14M22 52V14" fill="none" stroke="#c0362c" stroke-width="3"/><path d="M13 18h10M13 26h10M13 34h10" stroke="#c0362c" stroke-width="2.500"/>
      <path d="M-2 45h68" stroke-width="5"/><path d="M-2 45h68" stroke="#c0362c" stroke-width="2.500"/>${sea('#1f6a8a')}` },
    { name: 'LAKE HAVASU', at: 160000, icon: `<rect width="64" height="64" fill="#7fd0ff"/><path d="M-2 40l12-14 8 6 10-12 12 10 10-8 16 18z" fill="#c89a7c"/>
      <path d="M32 24V8" stroke-width="2.5"/><path d="M32 8h13v9H32z" fill="#1466d6"/><path d="M32 12.500h13M38.500 8v9" stroke="#e8262e" stroke-width="2.5"/>
      <path d="M-2 24h68v28h-4v-8a10 10 0 0 0-20 0v8h-4v-8a10 10 0 0 0-20 0v8h-4v-8a10 10 0 0 0-20 0v8z" fill="#d9d2c2"/><path d="M-2 30h68" fill="none"/>${sea('#1a8f9a')}` },
    { name: 'SUNSET COVE', at: 250000, icon: `<rect width="64" height="64" fill="#ff8a5c"/><rect width="64" height="22" fill="#6a3a8c" stroke="none"/><rect y="20" width="64" height="9" fill="#d05a7c" stroke="none"/>
      <circle cx="24" cy="46" r="15" fill="#ffd21f"/><path d="M48 52c1-12 0-22-4-30" fill="none" stroke-width="7"/><path d="M48 52c1-12 0-22-4-30" fill="none" stroke="#8a5a3a" stroke-width="3"/>
      <path d="M44 22c-8-7-15-5-19 0 7-2 13-1 19 0zM44 22c-3-10-10-13-17-11 7 2 12 5 17 11zM44 22c4-9 11-11 17-8-7 1-12 3-17 8zM44 22c8-4 15-2 18 4-6-3-12-4-18-4z" fill="#2f7a4a"/>${sea('#6a3a8c')}` },
    { name: 'LAKE WASHINGTON', at: 400000, icon: `<rect width="64" height="64" fill="#9fd0f0"/>
      <path d="M16 50l19-33c2-3 5-3 7 0l24 33z" fill="#f6f7fb"/><path d="M16 50l8-14 6 5 5-7 6 8 7-4 9 12z" fill="#7da3e0"/>
      <path d="M7 50c2-10 4-17 4-25M17 50c-2-10-4-17-4-25M12 16V5" fill="none" stroke-width="7"/><path d="M7 50c2-10 4-17 4-25M17 50c-2-10-4-17-4-25M12 16V5" fill="none" stroke="#f6f7fb" stroke-width="2"/><path d="M2 19h20l-4 6H6z" fill="#f6f7fb"/><path d="M6 19c0-5 12-5 12 0z" fill="#ff7a18"/>
      <path d="M-2 44h68v8H-2z" fill="#2f7a4a"/>${sea('#2a6a9a')}` },
    { name: 'MIDNIGHT CITY', at: 600000, icon: `<rect width="64" height="64" fill="#12205a"/><circle cx="48" cy="14" r="8" fill="#fff6c8"/>
      <path d="M8 9h2M24 6h2M32 16h2M16 18h2M58 30h2" stroke="#fff" stroke-width="2"/>
      <path d="M2 50V30h10v20zM12 50V18h12v32zM24 50V34h9v16zM33 50V24h11v26zM44 50V36h8v14zM52 50V28h10v22z" fill="#0b1026"/>
      <path d="M15 22h2M19 22h2M15 28h2M15 34h2M19 34h2M19 40h2M36 28h2M40 28h2M40 34h2M36 40h2M5 34h2M5 40h2M55 32h2M55 38h2M27 38h2M47 40h2" stroke="#ffd21f" stroke-width="2.5"/>${sea('#2a4a8c')}` },
  ],
};
