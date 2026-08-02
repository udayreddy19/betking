/** Team roster lookup with fuzzy name matching. */

const ROSTERS = {
  'sri lanka': {
    batters: ['I Dulani', 'AMCJK Athapaththu', 'Kavindi, Sanjana', 'RMVD Gunaratne', 'Vishmi Gunaratne', 'H Madavi'],
    bowlers: ['Umm-e-Hani', 'Waheeda Akhtar', 'Nashra Sandhu', 'Inoka Ranaweera'],
  },
  pakistan: {
    batters: ['G Feroza', 'Muneeba Ali', 'Nida Dar', 'Bismah Maroof', 'Ayesha Naseem', 'S Irfan'],
    bowlers: ['Umm-e-Hani', 'Waheeda Akhtar', 'Fatima Sana', 'Nashra Sandhu', 'Diana Baig'],
  },
  'london spirit': {
    batters: ['M. Bouchier', 'S. Molineux', 'A. Capsey', 'D. Wyatt'],
    bowlers: ['C. Dean', 'L. Smith', 'A. Capsey'],
  },
  'southern brave': {
    batters: ['D. Wyatt', 'S. Taylor', 'M. Bouchier', 'G. Adams'],
    bowlers: ['C. Dean', 'L. Smith', 'A. Capsey'],
  },
  'birmingham phoenix': {
    batters: ['J. Root', 'J. Cox', 'L. Livingstone', 'W. Smeed'],
    bowlers: ['A. Zampa', 'T. Southee', 'S. Mahmood'],
  },
  'welsh fire': {
    batters: ['J. Bairstow', 'T. Kohler-Cadmore', 'D. Payne', 'L. Wells'],
    bowlers: ['S. Mahmood', 'D. Payne', 'M. Crane'],
  },
  india: {
    batters: ['S. Gill', 'R. Sharma', 'V. Kohli', 'S. Iyer', 'H. Pandya', 'R. Pant'],
    bowlers: ['J. Bumrah', 'M. Shami', 'K. Yadav', 'A. Patel'],
  },
  australia: {
    batters: ['T. Head', 'D. Warner', 'S. Smith', 'G. Maxwell', 'M. Marsh'],
    bowlers: ['P. Cummins', 'M. Starc', 'A. Zampa', 'J. Hazlewood'],
  },
  england: {
    batters: ['J. Root', 'J. Bairstow', 'B. Stokes', 'J. Buttler', 'H. Brook'],
    bowlers: ['C. Woakes', 'M. Wood', 'A. Rashid', 'R. Stone'],
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

export function getRosterForTeam(teamName) {
  const key = normalizeTeamKey(teamName);

  if (ROSTERS[key]) return ROSTERS[key];

  for (const [rosterKey, roster] of Object.entries(ROSTERS)) {
    if (key.includes(rosterKey) || rosterKey.includes(key)) {
      return roster;
    }
  }

  const short = teamName.replace(/\s+W$/i, '').replace(/\s+Women$/i, '').split(' ')[0];
  return {
    batters: [`${short} Batter 1`, `${short} Batter 2`, `${short} Batter 3`],
    bowlers: [`${short} Bowler`, `${short} Bowler 2`],
  };
}

export { ROSTERS };
