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

  // ── IPL TEAMS & SRL ──
  'kolkata knight riders': {
    batters: ['Sunil Narine', 'Phil Salt', 'Venkatesh Iyer', 'Shreyas Iyer', 'Rinku Singh', 'Andre Russell', 'Ramandeep Singh'],
    bowlers: ['Mitchell Starc', 'Varun Chakaravarthy', 'Harshit Rana', 'Vaibhav Arora', 'Suyash Sharma'],
  },
  kkr: {
    batters: ['Sunil Narine', 'Phil Salt', 'Venkatesh Iyer', 'Shreyas Iyer', 'Rinku Singh', 'Andre Russell', 'Ramandeep Singh'],
    bowlers: ['Mitchell Starc', 'Varun Chakaravarthy', 'Harshit Rana', 'Vaibhav Arora', 'Suyash Sharma'],
  },
  kolk: {
    batters: ['Sunil Narine', 'Phil Salt', 'Venkatesh Iyer', 'Shreyas Iyer', 'Rinku Singh', 'Andre Russell', 'Ramandeep Singh'],
    bowlers: ['Mitchell Starc', 'Varun Chakaravarthy', 'Harshit Rana', 'Vaibhav Arora', 'Suyash Sharma'],
  },
  'punjab kings': {
    batters: ['Shikhar Dhawan', 'Jonny Bairstow', 'Prabhsimran Singh', 'Rilee Rossouw', 'Sam Curran', 'Jitesh Sharma', 'Shashank Singh', 'Ashutosh Sharma'],
    bowlers: ['Arshdeep Singh', 'Kagiso Rabada', 'Harshal Patel', 'Rahul Chahar', 'Harpreet Brar'],
  },
  pbks: {
    batters: ['Shikhar Dhawan', 'Jonny Bairstow', 'Prabhsimran Singh', 'Rilee Rossouw', 'Sam Curran', 'Jitesh Sharma', 'Shashank Singh', 'Ashutosh Sharma'],
    bowlers: ['Arshdeep Singh', 'Kagiso Rabada', 'Harshal Patel', 'Rahul Chahar', 'Harpreet Brar'],
  },
  punj: {
    batters: ['Shikhar Dhawan', 'Jonny Bairstow', 'Prabhsimran Singh', 'Rilee Rossouw', 'Sam Curran', 'Jitesh Sharma', 'Shashank Singh', 'Ashutosh Sharma'],
    bowlers: ['Arshdeep Singh', 'Kagiso Rabada', 'Harshal Patel', 'Rahul Chahar', 'Harpreet Brar'],
  },
  'delhi capitals': {
    batters: ['David Warner', 'Prithvi Shaw', 'Jake Fraser-McGurk', 'Rishabh Pant', 'Tristan Stubbs', 'Axar Patel', 'Abishek Porel'],
    bowlers: ['Kuldeep Yadav', 'Khaleel Ahmed', 'Mukesh Kumar', 'Ishant Sharma', 'Anrich Nortje'],
  },
  dc: {
    batters: ['David Warner', 'Prithvi Shaw', 'Jake Fraser-McGurk', 'Rishabh Pant', 'Tristan Stubbs', 'Axar Patel', 'Abishek Porel'],
    bowlers: ['Kuldeep Yadav', 'Khaleel Ahmed', 'Mukesh Kumar', 'Ishant Sharma', 'Anrich Nortje'],
  },
  dcl: {
    batters: ['David Warner', 'Prithvi Shaw', 'Jake Fraser-McGurk', 'Rishabh Pant', 'Tristan Stubbs', 'Axar Patel', 'Abishek Porel'],
    bowlers: ['Kuldeep Yadav', 'Khaleel Ahmed', 'Mukesh Kumar', 'Ishant Sharma', 'Anrich Nortje'],
  },
  'gujarat titans': {
    batters: ['Shubman Gill', 'Wriddhiman Saha', 'Sai Sudharsan', 'David Miller', 'Shahrukh Khan', 'Rahul Tewatia', 'Rashid Khan'],
    bowlers: ['Mohit Sharma', 'Noor Ahmad', 'Spencer Johnson', 'Umesh Yadav', 'Sai Kishore'],
  },
  gt: {
    batters: ['Shubman Gill', 'Wriddhiman Saha', 'Sai Sudharsan', 'David Miller', 'Shahrukh Khan', 'Rahul Tewatia', 'Rashid Khan'],
    bowlers: ['Mohit Sharma', 'Noor Ahmad', 'Spencer Johnson', 'Umesh Yadav', 'Sai Kishore'],
  },
  guja: {
    batters: ['Shubman Gill', 'Wriddhiman Saha', 'Sai Sudharsan', 'David Miller', 'Shahrukh Khan', 'Rahul Tewatia', 'Rashid Khan'],
    bowlers: ['Mohit Sharma', 'Noor Ahmad', 'Spencer Johnson', 'Umesh Yadav', 'Sai Kishore'],
  },
  'lucknow super giants': {
    batters: ['KL Rahul', 'Quinton de Kock', 'Marcus Stoinis', 'Nicholas Pooran', 'Ayush Badoni', 'Deepak Hooda', 'Krunal Pandya'],
    bowlers: ['Mayank Yadav', 'Ravi Bishnoi', 'Mohsin Khan', 'Naveen-ul-Haq', 'Yash Thakur'],
  },
  lsg: {
    batters: ['KL Rahul', 'Quinton de Kock', 'Marcus Stoinis', 'Nicholas Pooran', 'Ayush Badoni', 'Deepak Hooda', 'Krunal Pandya'],
    bowlers: ['Mayank Yadav', 'Ravi Bishnoi', 'Mohsin Khan', 'Naveen-ul-Haq', 'Yash Thakur'],
  },
  luck: {
    batters: ['KL Rahul', 'Quinton de Kock', 'Marcus Stoinis', 'Nicholas Pooran', 'Ayush Badoni', 'Deepak Hooda', 'Krunal Pandya'],
    bowlers: ['Mayank Yadav', 'Ravi Bishnoi', 'Mohsin Khan', 'Naveen-ul-Haq', 'Yash Thakur'],
  },

  // ── TAMIL NADU PREMIER LEAGUE (TNPL) ──
  'lyca kovai kings': {
    batters: ['Suresh Kumar', 'Sujay S', 'Balasubramaniam Sachin', 'Shahrukh Khan', 'U Mukilesh', 'Atheeq Ur Rahman'],
    bowlers: ['Manimaran Siddharth', 'M Mohammed', 'Jhatavedh Subramanyan', 'Valliappan Yudheeswaran', 'Gowtham Thamarai'],
  },
  lkk: {
    batters: ['Suresh Kumar', 'Sujay S', 'Balasubramaniam Sachin', 'Shahrukh Khan', 'U Mukilesh', 'Atheeq Ur Rahman'],
    bowlers: ['Manimaran Siddharth', 'M Mohammed', 'Jhatavedh Subramanyan', 'Valliappan Yudheeswaran', 'Gowtham Thamarai'],
  },
  'ruby trichy warriors': {
    batters: ['Ganga Sridhar Raju', 'Jafar Jamal', 'Mani Bharathi', 'Daryl Ferrario', 'Antony Dhas', 'R Rajkumar'],
    bowlers: ['P Saravana Kumar', 'K Easwaran', 'Rahil Shah', 'M Poiyamozhi', 'G Godson'],
  },
  rtw: {
    batters: ['Ganga Sridhar Raju', 'Jafar Jamal', 'Mani Bharathi', 'Daryl Ferrario', 'Antony Dhas', 'R Rajkumar'],
    bowlers: ['P Saravana Kumar', 'K Easwaran', 'Rahil Shah', 'M Poiyamozhi', 'G Godson'],
  },
  'dindigul dragons': {
    batters: ['Ravichandran Ashwin', 'Shivam Singh', 'Baba Indrajith', 'Boopathi Kumar', 'S Arun', 'Adithya Ganesh'],
    bowlers: ['Varun Chakaravarthy', 'Sandeep Warrier', 'Suboth Bhati', 'P Vignesh', 'G Kishoor'],
  },
  dd: {
    batters: ['Ravichandran Ashwin', 'Shivam Singh', 'Baba Indrajith', 'Boopathi Kumar', 'S Arun', 'Adithya Ganesh'],
    bowlers: ['Varun Chakaravarthy', 'Sandeep Warrier', 'Suboth Bhati', 'P Vignesh', 'G Kishoor'],
  },
  'chepauk super gillies': {
    batters: ['Baba Aparajith', 'N Jagadeesan', 'Pradosh Ranjan Paul', 'Daryl Ferrario', 'Abhishek Tanwar', 'Jitendra Kumar'],
    bowlers: ['Rahil Shah', 'M Silambarasan', 'Ganeshan Periyaswamy', 'Aswin Crist', 'Lokesh Raj'],
  },
  csg: {
    batters: ['Baba Aparajith', 'N Jagadeesan', 'Pradosh Ranjan Paul', 'Daryl Ferrario', 'Abhishek Tanwar', 'Jitendra Kumar'],
    bowlers: ['Rahil Shah', 'M Silambarasan', 'Ganeshan Periyaswamy', 'Aswin Crist', 'Lokesh Raj'],
  },

  // ── DELHI PREMIER LEAGUE (DPL) ──
  'new delhi tigers': {
    batters: ['Himmat Singh', 'Lakshay Thareja', 'Dhruv Kaushik', 'Keshav Dabas', 'Yash Sehrawat', 'Ayush Doseja'],
    bowlers: ['Divansh Rawat', 'Pranshu Vijayran', 'Pankaj Jaswal', 'Deepanshu Gulia', 'Rahul Gahlot'],
  },
  ndt: {
    batters: ['Himmat Singh', 'Lakshay Thareja', 'Dhruv Kaushik', 'Keshav Dabas', 'Yash Sehrawat', 'Ayush Doseja'],
    bowlers: ['Divansh Rawat', 'Pranshu Vijayran', 'Pankaj Jaswal', 'Deepanshu Gulia', 'Rahul Gahlot'],
  },
  'south delhi superstarz': {
    batters: ['Priyansh Arya', 'Ayush Badoni', 'Tejaswi Dahiya', 'Dhruv Singh', 'Vision Panchal', 'Kuldip Yadav'],
    bowlers: ['Digvesh Rathi', 'Sumit Mathur', 'Anshuman Hooda', 'Subodh Bhati', 'Raghav Singh'],
  },
  sds: {
    batters: ['Priyansh Arya', 'Ayush Badoni', 'Tejaswi Dahiya', 'Dhruv Singh', 'Vision Panchal', 'Kuldip Yadav'],
    bowlers: ['Digvesh Rathi', 'Sumit Mathur', 'Anshuman Hooda', 'Subodh Bhati', 'Raghav Singh'],
  },
  'east delhi riders': {
    batters: ['Anuj Rawat', 'Sujal Singh', 'Hardik Sharma', 'Mayank Rawat', 'Samarth Seth', 'Himanshu Chauhan'],
    bowlers: ['Simarjeet Singh', 'Navdeep Saini', 'Harsh Tyagi', 'Rounak Waghela', 'Bhagwan Singh'],
  },
  edr: {
    batters: ['Anuj Rawat', 'Sujal Singh', 'Hardik Sharma', 'Mayank Rawat', 'Samarth Seth', 'Himanshu Chauhan'],
    bowlers: ['Simarjeet Singh', 'Navdeep Saini', 'Harsh Tyagi', 'Rounak Waghela', 'Bhagwan Singh'],
  },
  'west delhi lions': {
    batters: ['Hrithik Shokeen', 'Ayush Doseja', 'Deepak Punia', 'Dev Lakra', 'Ankit Kumar', 'Krish Yadav'],
    bowlers: ['Ishant Sharma', 'Navdeep Saini', 'Manan Bhardwaj', 'Akhil Chaudhary', 'Tishant Dabla'],
  },
  wdl: {
    batters: ['Hrithik Shokeen', 'Ayush Doseja', 'Deepak Punia', 'Dev Lakra', 'Ankit Kumar', 'Krish Yadav'],
    bowlers: ['Ishant Sharma', 'Navdeep Saini', 'Manan Bhardwaj', 'Akhil Chaudhary', 'Tishant Dabla'],
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
  const str = typeof name === 'object' && name ? (name.name || '') : String(name || '');
  return str
    .replace(/\s*\([a-z0-9\s-]+\)/gi, '') // Remove (V), (W), (SRL), (Men), etc.
    .replace(/\s*(1st|2nd|3rd|4th|inns|innings|xi|srl|women|men|t20|test|virtual|v)\b/gi, '')
    .replace(/[^a-z0-9]/gi, ' ')
    .trim()
    .toLowerCase();
}

export function getRosterForTeam(teamName) {
  const empty = { batters: [], bowlers: [] };
  if (!teamName) return empty;
  const rawStr = typeof teamName === 'object' && teamName ? (teamName.name || '') : String(teamName || '');
  const cleanStr = rawStr
    .replace(/\s*\([a-z0-9\s-]+\)/gi, '')
    .replace(/\s*(1st|2nd|3rd|4th|inns|innings|virtual|v)\b/gi, '')
    .trim();
  const key = normalizeTeamKey(cleanStr).replace(/\s+/g, '');
  const exact = cleanStr.replace(/\s+srl$/i, '').trim();

  const withPlayers = (roster) => {
    if (!roster || typeof roster !== 'object') return empty;
    return {
      batters: Array.isArray(roster.batters) ? roster.batters : [],
      bowlers: Array.isArray(roster.bowlers) ? roster.bowlers : [],
    };
  };

  if (ROSTERS[key]) return withPlayers(ROSTERS[key]);
  if (ROSTERS[exact.toLowerCase()]) return withPlayers(ROSTERS[exact.toLowerCase()]);

  let best = null;
  let bestLen = 0;
  for (const [rosterKey, roster] of Object.entries(ROSTERS)) {
    const normRosterKey = rosterKey.replace(/\s+/g, '');
    if (normRosterKey.length < 3) continue;
    if (key === normRosterKey || (key.length >= 4 && (key.includes(normRosterKey) || normRosterKey.includes(key)))) {
      if (normRosterKey.length > bestLen) {
        best = roster;
        bestLen = normRosterKey.length;
      }
    }
  }
  if (best) return withPlayers(best);

  if (/^(wi|west indies|windies)$/i.test(exact)) return withPlayers(ROSTERS['west indies']);
  if (/^(pak|pakistan)$/i.test(exact)) return withPlayers(ROSTERS['pakistan']);
  if (/^(ind|india)$/i.test(exact)) return withPlayers(ROSTERS['india']);
  if (/^(eng|england)$/i.test(exact)) return withPlayers(ROSTERS['england']);
  if (/^(aus|australia)$/i.test(exact)) return withPlayers(ROSTERS['australia']);
  if (/^(sa|south africa)$/i.test(exact)) return withPlayers(ROSTERS['south africa']);
  if (/^(nz|new zealand|kiwis)$/i.test(exact)) return withPlayers(ROSTERS['new zealand']);
  if (/^(sl|sri lanka)$/i.test(exact)) return withPlayers(ROSTERS['sri lanka']);
  if (/^(rr|rajasthan royals|rajasthan|raja)$/i.test(exact)) return withPlayers(ROSTERS['rajasthan royals']);
  if (/^(srh|sunrisers hyderabad|hyderabad|hyde)$/i.test(exact)) return withPlayers(ROSTERS['sunrisers hyderabad']);
  if (/^(csk|chennai super kings|chennai|cskl)$/i.test(exact)) return withPlayers(ROSTERS['chennai super kings']);
  if (/^(mi|mumbai indians|mumbai)$/i.test(exact)) return withPlayers(ROSTERS['mumbai indians']);
  if (/^(rcb|royal challengers bengaluru|royal challengers bangalore|bengaluru|bangalore|beng)$/i.test(exact)) return withPlayers(ROSTERS['royal challengers bengaluru']);
  if (/^(kkr|kolkata knight riders|kolkata|kolk)$/i.test(exact)) return withPlayers(ROSTERS['kolkata knight riders']);
  if (/^(dc|delhi capitals|delhi|dcl)$/i.test(exact)) return withPlayers(ROSTERS['delhi capitals']);
  if (/^(pbks|punjab kings|punjab|punj)$/i.test(exact)) return withPlayers(ROSTERS['punjab kings']);
  if (/^(gt|gujarat titans|gujarat|guja)$/i.test(exact)) return withPlayers(ROSTERS['gujarat titans']);
  if (/^(lsg|lucknow super giants|lucknow|luck)$/i.test(exact)) return withPlayers(ROSTERS['lucknow super giants']);

  // Generic clean fallback names for unmapped custom / fantasy / virtual teams
  const cleanTeamLabel = cleanStr || teamName;
  return {
    batters: [
      `${cleanTeamLabel} Opener A`,
      `${cleanTeamLabel} Opener B`,
      `${cleanTeamLabel} Top Order`,
      `${cleanTeamLabel} Batter 4`,
      `${cleanTeamLabel} All-Rounder`,
    ],
    bowlers: [
      `${cleanTeamLabel} Lead Bowler`,
      `${cleanTeamLabel} Spinner`,
      `${cleanTeamLabel} Pacer`,
      `${cleanTeamLabel} Strike Bowler`,
    ],
  };
}

export { ROSTERS };

