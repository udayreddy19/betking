/** Team roster lookup with fuzzy name matching. */

const ROSTERS = {
  hampshire: {
    batters: ['James Vince', 'Ben McDermott', 'Nick Gubbins', 'Tom Prest', 'Joe Weatherley', 'Liam Dawson', 'James Fuller'],
    bowlers: ['Felix Organ', 'Chris Wood', 'Nathan Ellis', 'Mohammad Abbas'],
  },
  glamorgan: {
    batters: ['Sam Northeast', 'Eddie Byrom', 'Colin Ingram', 'Kiran Carlson', 'Chris Cooke', 'Billy Root', 'Dan Douthwaite'],
    bowlers: ['Timm van der Gugten', 'Mason Crane', 'Jamie McIlroy', 'Andy Gorvin'],
  },
  'colombo kaps': {
    batters: ['Sahan Dhananjaya', 'Sahan Arachchige', 'Avishka Fernando', 'Charith Asalanka', 'Dasun Shanaka', 'Kamindu Mendis', 'Wanindu Hasaranga'],
    bowlers: ['Chamika Karunaratne', 'Maheesh Theekshana', 'Matheesha Pathirana', 'Kasun Rajitha'],
  },
  'kandy royals': {
    batters: ['Pathum Nissanka', 'Dimuth Karunaratne', 'Kusal Perera', 'Bhanuka Rajapaksa', 'Dhananjaya de Silva', 'Akila Dananjaya', 'Dushmantha Chameera'],
    bowlers: ['Lahiru Kumara', 'Nuwan Pradeep', 'Praveen Jayawickrama', 'Vishwa Fernando'],
  },
  'sri lanka': {
    batters: ['Pathum Nissanka', 'Kusal Mendis', 'Charith Asalanka', 'Dhananjaya de Silva', 'Dasun Shanaka', 'Kamindu Mendis'],
    bowlers: ['Wanindu Hasaranga', 'Maheesh Theekshana', 'Matheesha Pathirana', 'Kasun Rajitha'],
  },
  pakistan: {
    batters: ['Babar Azam', 'Mohammad Rizwan', 'Fakhar Zaman', 'Saim Ayub', 'Iftikhar Ahmed', 'Shadab Khan'],
    bowlers: ['Shaheen Afridi', 'Naseem Shah', 'Haris Rauf', 'Mohammad Amir'],
  },
  'london spirit': {
    batters: ['D. Lawrence', 'K. Jennings', 'M. Pepper', 'O. Pope'],
    bowlers: ['O. Stone', 'L. Dawson', 'D. Worrall'],
  },
  'southern brave': {
    batters: ['J. Vince', 'L. du Plooy', 'A. Davies', 'J. Overton'],
    bowlers: ['C. Jordan', 'T. Mills', 'R. Ahmed'],
  },
  'birmingham phoenix': {
    batters: ['B. Duckett', 'J. Smith', 'L. Livingstone', 'M. Ali'],
    bowlers: ['A. Milne', 'T. Helm', 'S. Mahmood'],
  },
  'welsh fire': {
    batters: ['J. Bairstow', 'T. Kohler-Cadmore', 'G. Phillips', 'L. Wells'],
    bowlers: ['D. Willey', 'M. Henry', 'H. Paine'],
  },
  india: {
    batters: ['R. Sharma', 'Y. Jaiswal', 'V. Kohli', 'S. Yadav', 'R. Pant', 'H. Pandya'],
    bowlers: ['J. Bumrah', 'M. Siraj', 'K. Yadav', 'A. Singh'],
  },
  australia: {
    batters: ['T. Head', 'D. Warner', 'S. Smith', 'M. Labuschagne', 'G. Maxwell', 'M. Starc'],
    bowlers: ['P. Cummins', 'J. Hazlewood', 'A. Zampa', 'N. Lyon'],
  },
  england: {
    batters: ['P. Salt', 'J. Buttler', 'W. Jacks', 'H. Brook', 'L. Livingstone', 'M. Ali'],
    bowlers: ['J. Archer', 'A. Rashid', 'R. Topley', 'S. Curran'],
  },
};

export function normalizeTeamKey(name = '') {
  return String(name)
    .replace(/\s+W$/i, '')
    .replace(/\s+women$/i, '')
    .replace(/\s+men$/i, '')
    .trim()
    .toLowerCase();
}

const FIRST_NAMES = ['A. ', 'B. ', 'C. ', 'D. ', 'E. ', 'F. ', 'G. ', 'H. ', 'J. ', 'K. ', 'L. ', 'M. ', 'N. ', 'P. ', 'R. ', 'S. ', 'T. ', 'V. ', 'W. '];
const LAST_NAMES = ['Smith', 'Patel', 'Sharma', 'Taylor', 'Khan', 'Williams', 'Brown', 'Jones', 'Evans', 'Davies', 'Thomas', 'Roberts', 'Johnson', 'Wilson', 'Wright'];

export function getRosterForTeam(teamName) {
  const key = normalizeTeamKey(teamName);

  if (ROSTERS[key]) return ROSTERS[key];

  for (const [rosterKey, roster] of Object.entries(ROSTERS)) {
    if (key.includes(rosterKey) || rosterKey.includes(key)) {
      return roster;
    }
  }

  const hash = [...String(teamName)].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const batters = Array.from({ length: 7 }, (_, i) => {
    const fn = FIRST_NAMES[(hash + i * 3) % FIRST_NAMES.length];
    const ln = LAST_NAMES[(hash + i * 7) % LAST_NAMES.length];
    return `${fn}${ln}`;
  });
  const bowlers = Array.from({ length: 4 }, (_, i) => {
    const fn = FIRST_NAMES[(hash + (i + 7) * 3) % FIRST_NAMES.length];
    const ln = LAST_NAMES[(hash + (i + 7) * 7) % LAST_NAMES.length];
    return `${fn}${ln}`;
  });

  return { batters, bowlers };
}

export { ROSTERS };
