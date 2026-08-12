/** Team roster lookup with comprehensive international, IPL & domestic team coverage. */

const ROSTERS = {
  // ── INTERNATIONAL TEST & LIMITED OVERS TEAMS ──
  ireland: {
    batters: ['Paul Stirling', 'Andrew Balbirnie', 'Harry Tector', 'Lorcan Tucker', 'Curtis Campher', 'George Dockrell'],
    bowlers: ['Mark Adair', 'Joshua Little', 'Craig Young', 'Graham Hume', 'Barry McCarthy'],
  },
  ire: {
    batters: ['Paul Stirling', 'Andrew Balbirnie', 'Harry Tector', 'Lorcan Tucker', 'Curtis Campher', 'George Dockrell'],
    bowlers: ['Mark Adair', 'Joshua Little', 'Craig Young', 'Graham Hume', 'Barry McCarthy'],
  },
  afghanistan: {
    batters: ['Rahmanullah Gurbaz', 'Ibrahim Zadran', 'Rahmat Shah', 'Hashmatullah Shahidi', 'Azmatullah Omarzai', 'Mohammad Nabi'],
    bowlers: ['Rashid Khan', 'Mujeeb Ur Rahman', 'Fazalhaq Farooqi', 'Naveen-ul-Haq', 'Noor Ahmad'],
  },
  afg: {
    batters: ['Rahmanullah Gurbaz', 'Ibrahim Zadran', 'Rahmat Shah', 'Hashmatullah Shahidi', 'Azmatullah Omarzai', 'Mohammad Nabi'],
    bowlers: ['Rashid Khan', 'Mujeeb Ur Rahman', 'Fazalhaq Farooqi', 'Naveen-ul-Haq', 'Noor Ahmad'],
  },
  singapore: {
    batters: ['Aritra Dutta', 'Rohan Rangarajan', 'Surendran Chandramohan', 'Anish Paraam'],
    bowlers: ['Janak Prakash', 'Vinoth Baskaran', 'Amjad Mahboob', 'Akshay Puri'],
  },
  sin: {
    batters: ['Aritra Dutta', 'Rohan Rangarajan', 'Surendran Chandramohan', 'Anish Paraam'],
    bowlers: ['Janak Prakash', 'Vinoth Baskaran', 'Amjad Mahboob', 'Akshay Puri'],
  },
  bahrain: {
    batters: ['Haider Ali', 'Sarfraz Ali', 'Umer Toor', 'Ahmer Bin Nasir'],
    bowlers: ['Rizwan Butt', 'Ali Dawood', 'Abdul Majid', 'Junaid Niazi'],
  },
  bhr: {
    batters: ['Haider Ali', 'Sarfraz Ali', 'Umer Toor', 'Ahmer Bin Nasir'],
    bowlers: ['Rizwan Butt', 'Ali Dawood', 'Abdul Majid', 'Junaid Niazi'],
  },
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
    .replace(/\s*(1st|2nd|3rd|4th|inns|innings|xi|srl|women|men|t20|test)\b/gi, '')
    .replace(/[^a-z0-9]/gi, ' ')
    .trim()
    .toLowerCase();
}

export function getRosterForTeam(teamName) {
  if (!teamName) return { batters: [], bowlers: [] };
  const rawStr = String(teamName);
  const cleanStr = rawStr.replace(/\s*(1st|2nd|3rd|4th|inns|innings)\b/gi, '').trim();
  const key = normalizeTeamKey(cleanStr).replace(/\s+/g, '');

  if (ROSTERS[key]) return ROSTERS[key];

  for (const [rosterKey, roster] of Object.entries(ROSTERS)) {
    const normRosterKey = rosterKey.replace(/\s+/g, '');
    if (key === normRosterKey || (key.length >= 3 && normRosterKey.includes(key))) {
      return roster;
    }
  }

  // Alias lookups with word boundaries (handles "IND 1ST", "SL 1ST", "KKR 1ST", "CSK 1ST", etc.)
  if (/\b(wi|west indies|windies)\b/i.test(cleanStr)) return ROSTERS['west indies'];
  if (/\b(pak|pakistan)\b/i.test(cleanStr)) return ROSTERS['pakistan'];
  if (/\b(ind|india)\b/i.test(cleanStr)) return ROSTERS['india'];
  if (/\b(eng|england)\b/i.test(cleanStr)) return ROSTERS['england'];
  if (/\b(aus|australia)\b/i.test(cleanStr)) return ROSTERS['australia'];
  if (/\b(sa|south africa)\b/i.test(cleanStr)) return ROSTERS['south africa'];
  if (/\b(nz|new zealand|kiwis)\b/i.test(cleanStr)) return ROSTERS['new zealand'];
  if (/\b(sl|sri lanka)\b/i.test(cleanStr)) return ROSTERS['sri lanka'];
  if (/\b(rr|rajasthan)\b/i.test(cleanStr)) return ROSTERS['rajasthan royals'];
  if (/\b(srh|sunrisers|hyderabad)\b/i.test(cleanStr)) return ROSTERS['sunrisers hyderabad'];
  if (/\b(csk|chennai)\b/i.test(cleanStr)) return ROSTERS['chennai super kings'];
  if (/\b(mi|mumbai)\b/i.test(cleanStr)) return ROSTERS['mumbai indians'];
  if (/\b(rcb|bengaluru|bangalore)\b/i.test(cleanStr)) return ROSTERS['royal challengers bengaluru'];
  if (/\b(kkr|kolkata)\b/i.test(cleanStr)) return ROSTERS['kolkata knight riders'];
  if (/\b(dc|delhi)\b/i.test(cleanStr)) return ROSTERS['delhi capitals'];
  if (/\b(pbks|punjab)\b/i.test(cleanStr)) return ROSTERS['punjab kings'];
  if (/\b(gt|gujarat)\b/i.test(cleanStr)) return ROSTERS['gujarat titans'];
  if (/\b(lsg|lucknow)\b/i.test(cleanStr)) return ROSTERS['lucknow super giants'];

  return { batters: [], bowlers: [] };
}

export { ROSTERS };
