/** Team roster lookup with comprehensive international, IPL & domestic team coverage. */

const ROSTERS = {
  // ── INTERNATIONAL TEST & LIMITED OVERS TEAMS ──
  'west indies': {
    batters: ['Kraigg Brathwaite', 'Tevin Imlach', 'Alick Athanaze', 'Kavem Hodge', 'Shamarh Brooks', 'Joshua Da Silva', 'Jason Holder', 'Justin Greaves'],
    bowlers: ['Alzarri Joseph', 'Shamar Joseph', 'Jayden Seales', 'Gudakesh Motie', 'Kemar Roach'],
  },
  wi: {
    batters: ['Kraigg Brathwaite', 'Tevin Imlach', 'Alick Athanaze', 'Kavem Hodge', 'Shamarh Brooks', 'Joshua Da Silva', 'Jason Holder', 'Justin Greaves'],
    bowlers: ['Alzarri Joseph', 'Shamar Joseph', 'Jayden Seales', 'Gudakesh Motie', 'Kemar Roach'],
  },
  pakistan: {
    batters: ['Abdullah Shafique', 'Shan Masood', 'Babar Azam', 'Saud Shakeel', 'Mohammad Rizwan', 'Agha Salman', 'Kamran Ghulam'],
    bowlers: ['Shaheen Afridi', 'Naseem Shah', 'Noman Ali', 'Sajid Khan', 'Mir Hamza', 'Aamir Jamal'],
  },
  pak: {
    batters: ['Abdullah Shafique', 'Shan Masood', 'Babar Azam', 'Saud Shakeel', 'Mohammad Rizwan', 'Agha Salman', 'Kamran Ghulam'],
    bowlers: ['Shaheen Afridi', 'Naseem Shah', 'Noman Ali', 'Sajid Khan', 'Mir Hamza', 'Aamir Jamal'],
  },
  india: {
    batters: ['Rohit Sharma', 'Yashasvi Jaiswal', 'Shubman Gill', 'Virat Kohli', 'Rishabh Pant', 'KL Rahul', 'Ravindra Jadeja'],
    bowlers: ['Jasprit Bumrah', 'Mohammed Siraj', 'Kuldeep Yadav', 'Akash Deep', 'Mohammed Shami'],
  },
  ind: {
    batters: ['Rohit Sharma', 'Yashasvi Jaiswal', 'Shubman Gill', 'Virat Kohli', 'Rishabh Pant', 'KL Rahul', 'Ravindra Jadeja'],
    bowlers: ['Jasprit Bumrah', 'Mohammed Siraj', 'Kuldeep Yadav', 'Akash Deep', 'Mohammed Shami'],
  },
  australia: {
    batters: ['Usman Khawaja', 'Nathan McSweeney', 'Marnus Labuschagne', 'Steven Smith', 'Travis Head', 'Mitchell Marsh', 'Alex Carey'],
    bowlers: ['Pat Cummins', 'Mitchell Starc', 'Josh Hazlewood', 'Nathan Lyon', 'Scott Boland'],
  },
  aus: {
    batters: ['Usman Khawaja', 'Nathan McSweeney', 'Marnus Labuschagne', 'Steven Smith', 'Travis Head', 'Mitchell Marsh', 'Alex Carey'],
    bowlers: ['Pat Cummins', 'Mitchell Starc', 'Josh Hazlewood', 'Nathan Lyon', 'Scott Boland'],
  },
  england: {
    batters: ['Zak Crawley', 'Ben Duckett', 'Ollie Pope', 'Joe Root', 'Harry Brook', 'Ben Stokes', 'Jamie Smith'],
    bowlers: ['Chris Woakes', 'Gus Atkinson', 'Shoaib Bashir', 'Jack Leach', 'Mark Wood'],
  },
  eng: {
    batters: ['Zak Crawley', 'Ben Duckett', 'Ollie Pope', 'Joe Root', 'Harry Brook', 'Ben Stokes', 'Jamie Smith'],
    bowlers: ['Chris Woakes', 'Gus Atkinson', 'Shoaib Bashir', 'Jack Leach', 'Mark Wood'],
  },
  'south africa': {
    batters: ['Aiden Markram', 'Tony de Zorzi', 'Tristan Stubbs', 'Temba Bavuma', 'David Bedingham', 'Kyle Verreynne', 'Wiaan Mulder'],
    bowlers: ['Kagiso Rabada', 'Marco Jansen', 'Keshav Maharaj', 'Dane Paterson', 'Lungi Ngidi'],
  },
  sa: {
    batters: ['Aiden Markram', 'Tony de Zorzi', 'Tristan Stubbs', 'Temba Bavuma', 'David Bedingham', 'Kyle Verreynne', 'Wiaan Mulder'],
    bowlers: ['Kagiso Rabada', 'Marco Jansen', 'Keshav Maharaj', 'Dane Paterson', 'Lungi Ngidi'],
  },
  'new zealand': {
    batters: ['Tom Latham', 'Devon Conway', 'Kane Williamson', 'Rachin Ravindra', 'Daryl Mitchell', 'Tom Blundell', 'Glenn Phillips'],
    bowlers: ['Tim Southee', 'Matt Henry', 'Ajaz Patel', 'William O\'Rourke', 'Mitchell Santner'],
  },
  nz: {
    batters: ['Tom Latham', 'Devon Conway', 'Kane Williamson', 'Rachin Ravindra', 'Daryl Mitchell', 'Tom Blundell', 'Glenn Phillips'],
    bowlers: ['Tim Southee', 'Matt Henry', 'Ajaz Patel', 'William O\'Rourke', 'Mitchell Santner'],
  },
  'sri lanka': {
    batters: ['Pathum Nissanka', 'Dimuth Karunaratne', 'Dinesh Chandimal', 'Angelo Mathews', 'Kamindu Mendis', 'Dhananjaya de Silva', 'Kusal Mendis'],
    bowlers: ['Prabath Jayasuriya', 'Asitha Fernando', 'Vishwa Fernando', 'Milan Rathnayake', 'Wanindu Hasaranga'],
  },
  sl: {
    batters: ['Pathum Nissanka', 'Dimuth Karunaratne', 'Dinesh Chandimal', 'Angelo Mathews', 'Kamindu Mendis', 'Dhananjaya de Silva', 'Kusal Mendis'],
    bowlers: ['Prabath Jayasuriya', 'Asitha Fernando', 'Vishwa Fernando', 'Milan Rathnayake', 'Wanindu Hasaranga'],
  },
  bangladesh: {
    batters: ['Shadman Islam', 'Zakir Hasan', 'Najmul Hossain Shanto', 'Mominul Haque', 'Mushfiqur Rahim', 'Litton Das', 'Mehidy Hasan Miraz'],
    bowlers: ['Hasan Mahmud', 'Taskin Ahmed', 'Nahid Rana', 'Taijul Islam'],
  },
  ban: {
    batters: ['Shadman Islam', 'Zakir Hasan', 'Najmul Hossain Shanto', 'Mominul Haque', 'Mushfiqur Rahim', 'Litton Das', 'Mehidy Hasan Miraz'],
    bowlers: ['Hasan Mahmud', 'Taskin Ahmed', 'Nahid Rana', 'Taijul Islam'],
  },

  // ── IPL TEAMS & SRL ──
  'rajasthan royals': {
    batters: ['Yashasvi Jaiswal', 'Sanju Samson', 'Riyan Parag', 'Shimron Hetmyer', 'Dhruv Jurel', 'Ravichandran Ashwin'],
    bowlers: ['Yuzvendra Chahal', 'Trent Boult', 'Avesh Khan', 'Sandeep Sharma', 'Nandre Burger'],
  },
  rr: {
    batters: ['Yashasvi Jaiswal', 'Sanju Samson', 'Riyan Parag', 'Shimron Hetmyer', 'Dhruv Jurel', 'Ravichandran Ashwin'],
    bowlers: ['Yuzvendra Chahal', 'Trent Boult', 'Avesh Khan', 'Sandeep Sharma', 'Nandre Burger'],
  },
  'sunrisers hyderabad': {
    batters: ['Travis Head', 'Abhishek Sharma', 'Heinrich Klaasen', 'Nitish Kumar Reddy', 'Abdul Samad', 'Shahbaz Ahmed'],
    bowlers: ['Pat Cummins', 'Bhuvaneshwar Kumar', 'T. Natarajan', 'Jaydev Unadkat', 'Mayank Markande'],
  },
  srh: {
    batters: ['Travis Head', 'Abhishek Sharma', 'Heinrich Klaasen', 'Nitish Kumar Reddy', 'Abdul Samad', 'Shahbaz Ahmed'],
    bowlers: ['Pat Cummins', 'Bhuvaneshwar Kumar', 'T. Natarajan', 'Jaydev Unadkat', 'Mayank Markande'],
  },
  'chennai super kings': {
    batters: ['Ruturaj Gaikwad', 'Rachin Ravindra', 'Shivam Dube', 'MS Dhoni', 'Moeen Ali', 'Ravindra Jadeja'],
    bowlers: ['Matheesha Pathirana', 'Deepak Chahar', 'Tushar Deshpande', 'Maheesh Theekshana', 'Mustafizur Rahman'],
  },
  csk: {
    batters: ['Ruturaj Gaikwad', 'Rachin Ravindra', 'Shivam Dube', 'MS Dhoni', 'Moeen Ali', 'Ravindra Jadeja'],
    bowlers: ['Matheesha Pathirana', 'Deepak Chahar', 'Tushar Deshpande', 'Maheesh Theekshana', 'Mustafizur Rahman'],
  },
  'mumbai indians': {
    batters: ['Rohit Sharma', 'Ishan Kishan', 'Suryakumar Yadav', 'Tilak Varma', 'Hardik Pandya', 'Tim David'],
    bowlers: ['Jasprit Bumrah', 'Gerald Coetzee', 'Piyush Chawla', 'Naman Dhir', 'Nuwan Thushara'],
  },
  mi: {
    batters: ['Rohit Sharma', 'Ishan Kishan', 'Suryakumar Yadav', 'Tilak Varma', 'Hardik Pandya', 'Tim David'],
    bowlers: ['Jasprit Bumrah', 'Gerald Coetzee', 'Piyush Chawla', 'Naman Dhir', 'Nuwan Thushara'],
  },
  'royal challengers bengaluru': {
    batters: ['Virat Kohli', 'Faf du Plessis', 'Rajat Patidar', 'Glenn Maxwell', 'Dinesh Karthik', 'Mahipal Lomror'],
    bowlers: ['Mohammed Siraj', 'Yash Dayal', 'Karn Sharma', 'Lockie Ferguson', 'Reece Topley'],
  },
  rcb: {
    batters: ['Virat Kohli', 'Faf du Plessis', 'Rajat Patidar', 'Glenn Maxwell', 'Dinesh Karthik', 'Mahipal Lomror'],
    bowlers: ['Mohammed Siraj', 'Yash Dayal', 'Karn Sharma', 'Lockie Ferguson', 'Reece Topley'],
  },

  // ── DOMESTIC & LEAGUE TEAMS ──
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
  'oval invincibles': {
    batters: ['Will Jacks', 'Dawid Malan', 'Sam Curran', 'Jordan Cox', 'Donovan Ferreira', 'Tom Curran'],
    bowlers: ['Adam Zampa', 'Saqib Mahmood', 'Nathan Sowter', 'Marchant de Lange'],
  },
  ovi: {
    batters: ['Will Jacks', 'Dawid Malan', 'Sam Curran', 'Jordan Cox', 'Donovan Ferreira', 'Tom Curran'],
    bowlers: ['Adam Zampa', 'Saqib Mahmood', 'Nathan Sowter', 'Marchant de Lange'],
  },
  'trent rockets': {
    batters: ['Alex Hales', 'Tom Banton', 'Joe Root', 'Rovman Powell', 'Lewis Gregory', 'Rashid Khan'],
    bowlers: ['Luke Wood', 'Sam Cook', 'Imad Wasim', 'Calum Parkinson'],
  },
  trt: {
    batters: ['Alex Hales', 'Tom Banton', 'Joe Root', 'Rovman Powell', 'Lewis Gregory', 'Rashid Khan'],
    bowlers: ['Luke Wood', 'Sam Cook', 'Imad Wasim', 'Calum Parkinson'],
  },
  'jaffna kings': {
    batters: ['Pathum Nissanka', 'Kusal Mendis', 'Avishka Fernando', 'Charith Asalanka', 'Azmatullah Omarzai', 'Fabian Allen'],
    bowlers: ['Tabraiz Shamsi', 'Asitha Fernando', 'Vijayakanth Viyaskanth', 'Pramod Madushan'],
  },
  jfk: {
    batters: ['Pathum Nissanka', 'Kusal Mendis', 'Avishka Fernando', 'Charith Asalanka', 'Azmatullah Omarzai', 'Fabian Allen'],
    bowlers: ['Tabraiz Shamsi', 'Asitha Fernando', 'Vijayakanth Viyaskanth', 'Pramod Madushan'],
  },
  'colombo strikers': {
    batters: ['Rahmanullah Gurbaz', 'Muhammad Waseem', 'Sadeera Samarawickrama', 'Glenn Phillips', 'Dunith Wellalage', 'Chamika Karunaratne'],
    bowlers: ['Matheesha Pathirana', 'Taskin Ahmed', 'Binura Fernando', 'Shadab Khan'],
  },
  cls: {
    batters: ['Rahmanullah Gurbaz', 'Muhammad Waseem', 'Sadeera Samarawickrama', 'Glenn Phillips', 'Dunith Wellalage', 'Chamika Karunaratne'],
    bowlers: ['Matheesha Pathirana', 'Taskin Ahmed', 'Binura Fernando', 'Shadab Khan'],
  },
};

export function normalizeTeamKey(name = '') {
  return String(name)
    .replace(/\s+srl$/i, '')
    .replace(/\s+w$/i, '')
    .replace(/\s+women$/i, '')
    .replace(/\s+men$/i, '')
    .replace(/\s+t20$/i, '')
    .replace(/\s+test$/i, '')
    .replace(/[^a-z0-9]/gi, ' ')
    .trim()
    .toLowerCase();
}

export function getRosterForTeam(teamName) {
  if (!teamName) return { batters: [], bowlers: [] };
  const key = normalizeTeamKey(teamName);

  if (ROSTERS[key]) return ROSTERS[key];

  for (const [rosterKey, roster] of Object.entries(ROSTERS)) {
    if (key === rosterKey || key.includes(rosterKey) || rosterKey.includes(key)) {
      return roster;
    }
  }

  // Alias lookups for common country/team name variations
  if (key === 'wi' || key.includes('west indies') || key.includes('windies')) return ROSTERS['west indies'];
  if (key === 'pak' || key.includes('pakistan')) return ROSTERS['pakistan'];
  if (key === 'ind' || key.includes('india')) return ROSTERS['india'];
  if (key === 'eng' || key.includes('england')) return ROSTERS['england'];
  if (key === 'aus' || key.includes('australia')) return ROSTERS['australia'];
  if (key === 'sa' || key.includes('south africa')) return ROSTERS['south africa'];
  if (key === 'nz' || key.includes('new zealand')) return ROSTERS['new zealand'];
  if (key === 'sl' || key.includes('sri lanka')) return ROSTERS['sri lanka'];
  if (key === 'rr' || key.includes('rajasthan')) return ROSTERS['rajasthan royals'];
  if (key === 'srh' || key.includes('sunrisers') || key.includes('hyderabad')) return ROSTERS['sunrisers hyderabad'];
  if (key === 'csk' || key.includes('chennai')) return ROSTERS['chennai super kings'];
  if (key === 'mi' || key.includes('mumbai')) return ROSTERS['mumbai indians'];
  if (key === 'rcb' || key.includes('bengaluru') || key.includes('bangalore')) return ROSTERS['royal challengers bengaluru'];

  const cleanName = String(teamName).replace(/\s+srl$/i, '').trim();
  return {
    batters: [
      `${cleanName} Opener 1`,
      `${cleanName} Opener 2`,
      `${cleanName} Batter 3`,
      `${cleanName} Batter 4`,
      `${cleanName} Batter 5`,
      `${cleanName} All-Rounder 1`,
      `${cleanName} All-Rounder 2`,
    ],
    bowlers: [
      `${cleanName} Pacer 1`,
      `${cleanName} Pacer 2`,
      `${cleanName} Spinner 1`,
      `${cleanName} Pacer 3`,
    ],
  };
}

export { ROSTERS };
