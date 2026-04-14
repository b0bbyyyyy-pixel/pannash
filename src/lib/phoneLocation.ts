// Comprehensive US area code to location and timezone mapping
interface AreaCodeData {
  areaCode: string;
  city: string;
  state: string;
  timezone: string; // IANA timezone name
}

const areaCodeDatabase: AreaCodeData[] = [
  // Alabama
  { areaCode: '205', city: 'Birmingham', state: 'AL', timezone: 'America/Chicago' },
  { areaCode: '251', city: 'Mobile', state: 'AL', timezone: 'America/Chicago' },
  { areaCode: '256', city: 'Huntsville', state: 'AL', timezone: 'America/Chicago' },
  { areaCode: '334', city: 'Montgomery', state: 'AL', timezone: 'America/Chicago' },
  { areaCode: '659', city: 'Birmingham', state: 'AL', timezone: 'America/Chicago' },
  { areaCode: '938', city: 'Huntsville', state: 'AL', timezone: 'America/Chicago' },
  
  // Alaska
  { areaCode: '907', city: 'Anchorage', state: 'AK', timezone: 'America/Anchorage' },
  
  // Arizona
  { areaCode: '480', city: 'Scottsdale', state: 'AZ', timezone: 'America/Phoenix' },
  { areaCode: '520', city: 'Tucson', state: 'AZ', timezone: 'America/Phoenix' },
  { areaCode: '602', city: 'Phoenix', state: 'AZ', timezone: 'America/Phoenix' },
  { areaCode: '623', city: 'Glendale', state: 'AZ', timezone: 'America/Phoenix' },
  { areaCode: '928', city: 'Flagstaff', state: 'AZ', timezone: 'America/Phoenix' },
  
  // Arkansas
  { areaCode: '479', city: 'Fort Smith', state: 'AR', timezone: 'America/Chicago' },
  { areaCode: '501', city: 'Little Rock', state: 'AR', timezone: 'America/Chicago' },
  { areaCode: '870', city: 'Jonesboro', state: 'AR', timezone: 'America/Chicago' },
  
  // California
  { areaCode: '209', city: 'Stockton', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '213', city: 'Los Angeles', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '279', city: 'Sacramento', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '310', city: 'Santa Monica', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '323', city: 'Los Angeles', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '341', city: 'Oakland', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '369', city: 'Napa', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '408', city: 'San Jose', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '415', city: 'San Francisco', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '424', city: 'Los Angeles', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '442', city: 'Oceanside', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '510', city: 'Oakland', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '530', city: 'Redding', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '559', city: 'Fresno', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '562', city: 'Long Beach', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '619', city: 'San Diego', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '626', city: 'Pasadena', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '628', city: 'San Francisco', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '650', city: 'San Mateo', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '657', city: 'Anaheim', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '661', city: 'Bakersfield', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '669', city: 'San Jose', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '707', city: 'Santa Rosa', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '714', city: 'Anaheim', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '747', city: 'Burbank', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '760', city: 'Palm Springs', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '805', city: 'Santa Barbara', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '818', city: 'Burbank', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '820', city: 'Sacramento', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '831', city: 'Salinas', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '840', city: 'Sacramento', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '858', city: 'San Diego', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '909', city: 'San Bernardino', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '916', city: 'Sacramento', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '925', city: 'Concord', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '949', city: 'Irvine', state: 'CA', timezone: 'America/Los_Angeles' },
  { areaCode: '951', city: 'Riverside', state: 'CA', timezone: 'America/Los_Angeles' },
  
  // Colorado
  { areaCode: '303', city: 'Denver', state: 'CO', timezone: 'America/Denver' },
  { areaCode: '719', city: 'Colorado Springs', state: 'CO', timezone: 'America/Denver' },
  { areaCode: '720', city: 'Denver', state: 'CO', timezone: 'America/Denver' },
  { areaCode: '970', city: 'Fort Collins', state: 'CO', timezone: 'America/Denver' },
  { areaCode: '983', city: 'Denver', state: 'CO', timezone: 'America/Denver' },
  
  // Connecticut
  { areaCode: '203', city: 'New Haven', state: 'CT', timezone: 'America/New_York' },
  { areaCode: '475', city: 'Bridgeport', state: 'CT', timezone: 'America/New_York' },
  { areaCode: '860', city: 'Hartford', state: 'CT', timezone: 'America/New_York' },
  { areaCode: '959', city: 'Hartford', state: 'CT', timezone: 'America/New_York' },
  
  // Delaware
  { areaCode: '302', city: 'Wilmington', state: 'DE', timezone: 'America/New_York' },
  
  // Florida
  { areaCode: '239', city: 'Fort Myers', state: 'FL', timezone: 'America/New_York' },
  { areaCode: '305', city: 'Miami', state: 'FL', timezone: 'America/New_York' },
  { areaCode: '321', city: 'Orlando', state: 'FL', timezone: 'America/New_York' },
  { areaCode: '352', city: 'Gainesville', state: 'FL', timezone: 'America/New_York' },
  { areaCode: '386', city: 'Daytona Beach', state: 'FL', timezone: 'America/New_York' },
  { areaCode: '407', city: 'Orlando', state: 'FL', timezone: 'America/New_York' },
  { areaCode: '448', city: 'Orlando', state: 'FL', timezone: 'America/New_York' },
  { areaCode: '561', city: 'West Palm Beach', state: 'FL', timezone: 'America/New_York' },
  { areaCode: '727', city: 'St. Petersburg', state: 'FL', timezone: 'America/New_York' },
  { areaCode: '754', city: 'Fort Lauderdale', state: 'FL', timezone: 'America/New_York' },
  { areaCode: '772', city: 'Port St. Lucie', state: 'FL', timezone: 'America/New_York' },
  { areaCode: '786', city: 'Miami', state: 'FL', timezone: 'America/New_York' },
  { areaCode: '813', city: 'Tampa', state: 'FL', timezone: 'America/New_York' },
  { areaCode: '850', city: 'Tallahassee', state: 'FL', timezone: 'America/Chicago' },
  { areaCode: '863', city: 'Lakeland', state: 'FL', timezone: 'America/New_York' },
  { areaCode: '904', city: 'Jacksonville', state: 'FL', timezone: 'America/New_York' },
  { areaCode: '941', city: 'Sarasota', state: 'FL', timezone: 'America/New_York' },
  { areaCode: '954', city: 'Fort Lauderdale', state: 'FL', timezone: 'America/New_York' },
  
  // Georgia
  { areaCode: '229', city: 'Albany', state: 'GA', timezone: 'America/New_York' },
  { areaCode: '404', city: 'Atlanta', state: 'GA', timezone: 'America/New_York' },
  { areaCode: '470', city: 'Atlanta', state: 'GA', timezone: 'America/New_York' },
  { areaCode: '478', city: 'Macon', state: 'GA', timezone: 'America/New_York' },
  { areaCode: '678', city: 'Atlanta', state: 'GA', timezone: 'America/New_York' },
  { areaCode: '706', city: 'Augusta', state: 'GA', timezone: 'America/New_York' },
  { areaCode: '762', city: 'Augusta', state: 'GA', timezone: 'America/New_York' },
  { areaCode: '770', city: 'Marietta', state: 'GA', timezone: 'America/New_York' },
  { areaCode: '912', city: 'Savannah', state: 'GA', timezone: 'America/New_York' },
  { areaCode: '943', city: 'Atlanta', state: 'GA', timezone: 'America/New_York' },
  
  // Hawaii
  { areaCode: '808', city: 'Honolulu', state: 'HI', timezone: 'Pacific/Honolulu' },
  
  // Idaho
  { areaCode: '208', city: 'Boise', state: 'ID', timezone: 'America/Denver' },
  { areaCode: '986', city: 'Boise', state: 'ID', timezone: 'America/Denver' },
  
  // Illinois
  { areaCode: '217', city: 'Springfield', state: 'IL', timezone: 'America/Chicago' },
  { areaCode: '224', city: 'Evanston', state: 'IL', timezone: 'America/Chicago' },
  { areaCode: '309', city: 'Peoria', state: 'IL', timezone: 'America/Chicago' },
  { areaCode: '312', city: 'Chicago', state: 'IL', timezone: 'America/Chicago' },
  { areaCode: '331', city: 'Aurora', state: 'IL', timezone: 'America/Chicago' },
  { areaCode: '447', city: 'Chicago', state: 'IL', timezone: 'America/Chicago' },
  { areaCode: '464', city: 'Aurora', state: 'IL', timezone: 'America/Chicago' },
  { areaCode: '618', city: 'Belleville', state: 'IL', timezone: 'America/Chicago' },
  { areaCode: '630', city: 'Aurora', state: 'IL', timezone: 'America/Chicago' },
  { areaCode: '708', city: 'Cicero', state: 'IL', timezone: 'America/Chicago' },
  { areaCode: '773', city: 'Chicago', state: 'IL', timezone: 'America/Chicago' },
  { areaCode: '779', city: 'Rockford', state: 'IL', timezone: 'America/Chicago' },
  { areaCode: '815', city: 'Joliet', state: 'IL', timezone: 'America/Chicago' },
  { areaCode: '847', city: 'Evanston', state: 'IL', timezone: 'America/Chicago' },
  { areaCode: '872', city: 'Chicago', state: 'IL', timezone: 'America/Chicago' },
  
  // Indiana
  { areaCode: '219', city: 'Gary', state: 'IN', timezone: 'America/Chicago' },
  { areaCode: '260', city: 'Fort Wayne', state: 'IN', timezone: 'America/New_York' },
  { areaCode: '317', city: 'Indianapolis', state: 'IN', timezone: 'America/New_York' },
  { areaCode: '463', city: 'Indianapolis', state: 'IN', timezone: 'America/New_York' },
  { areaCode: '574', city: 'South Bend', state: 'IN', timezone: 'America/New_York' },
  { areaCode: '765', city: 'Muncie', state: 'IN', timezone: 'America/New_York' },
  { areaCode: '812', city: 'Evansville', state: 'IN', timezone: 'America/New_York' },
  { areaCode: '930', city: 'Indianapolis', state: 'IN', timezone: 'America/New_York' },
  
  // Iowa
  { areaCode: '319', city: 'Cedar Rapids', state: 'IA', timezone: 'America/Chicago' },
  { areaCode: '515', city: 'Des Moines', state: 'IA', timezone: 'America/Chicago' },
  { areaCode: '563', city: 'Davenport', state: 'IA', timezone: 'America/Chicago' },
  { areaCode: '641', city: 'Mason City', state: 'IA', timezone: 'America/Chicago' },
  { areaCode: '712', city: 'Sioux City', state: 'IA', timezone: 'America/Chicago' },
  
  // Kansas
  { areaCode: '316', city: 'Wichita', state: 'KS', timezone: 'America/Chicago' },
  { areaCode: '620', city: 'Hutchinson', state: 'KS', timezone: 'America/Chicago' },
  { areaCode: '785', city: 'Topeka', state: 'KS', timezone: 'America/Chicago' },
  { areaCode: '913', city: 'Kansas City', state: 'KS', timezone: 'America/Chicago' },
  
  // Kentucky
  { areaCode: '270', city: 'Bowling Green', state: 'KY', timezone: 'America/Chicago' },
  { areaCode: '364', city: 'Bowling Green', state: 'KY', timezone: 'America/Chicago' },
  { areaCode: '502', city: 'Louisville', state: 'KY', timezone: 'America/New_York' },
  { areaCode: '606', city: 'Ashland', state: 'KY', timezone: 'America/New_York' },
  { areaCode: '859', city: 'Lexington', state: 'KY', timezone: 'America/New_York' },
  
  // Louisiana
  { areaCode: '225', city: 'Baton Rouge', state: 'LA', timezone: 'America/Chicago' },
  { areaCode: '318', city: 'Shreveport', state: 'LA', timezone: 'America/Chicago' },
  { areaCode: '337', city: 'Lafayette', state: 'LA', timezone: 'America/Chicago' },
  { areaCode: '504', city: 'New Orleans', state: 'LA', timezone: 'America/Chicago' },
  { areaCode: '985', city: 'Houma', state: 'LA', timezone: 'America/Chicago' },
  
  // Maine
  { areaCode: '207', city: 'Portland', state: 'ME', timezone: 'America/New_York' },
  
  // Maryland
  { areaCode: '240', city: 'Germantown', state: 'MD', timezone: 'America/New_York' },
  { areaCode: '301', city: 'Germantown', state: 'MD', timezone: 'America/New_York' },
  { areaCode: '410', city: 'Baltimore', state: 'MD', timezone: 'America/New_York' },
  { areaCode: '443', city: 'Baltimore', state: 'MD', timezone: 'America/New_York' },
  { areaCode: '667', city: 'Baltimore', state: 'MD', timezone: 'America/New_York' },
  
  // Massachusetts
  { areaCode: '339', city: 'Boston', state: 'MA', timezone: 'America/New_York' },
  { areaCode: '351', city: 'Lowell', state: 'MA', timezone: 'America/New_York' },
  { areaCode: '413', city: 'Springfield', state: 'MA', timezone: 'America/New_York' },
  { areaCode: '508', city: 'Worcester', state: 'MA', timezone: 'America/New_York' },
  { areaCode: '617', city: 'Boston', state: 'MA', timezone: 'America/New_York' },
  { areaCode: '774', city: 'Worcester', state: 'MA', timezone: 'America/New_York' },
  { areaCode: '781', city: 'Lynn', state: 'MA', timezone: 'America/New_York' },
  { areaCode: '857', city: 'Boston', state: 'MA', timezone: 'America/New_York' },
  { areaCode: '978', city: 'Lowell', state: 'MA', timezone: 'America/New_York' },
  
  // Michigan
  { areaCode: '231', city: 'Traverse City', state: 'MI', timezone: 'America/New_York' },
  { areaCode: '248', city: 'Troy', state: 'MI', timezone: 'America/New_York' },
  { areaCode: '269', city: 'Kalamazoo', state: 'MI', timezone: 'America/New_York' },
  { areaCode: '313', city: 'Detroit', state: 'MI', timezone: 'America/New_York' },
  { areaCode: '517', city: 'Lansing', state: 'MI', timezone: 'America/New_York' },
  { areaCode: '586', city: 'Warren', state: 'MI', timezone: 'America/New_York' },
  { areaCode: '616', city: 'Grand Rapids', state: 'MI', timezone: 'America/New_York' },
  { areaCode: '734', city: 'Ann Arbor', state: 'MI', timezone: 'America/New_York' },
  { areaCode: '810', city: 'Flint', state: 'MI', timezone: 'America/New_York' },
  { areaCode: '906', city: 'Marquette', state: 'MI', timezone: 'America/New_York' },
  { areaCode: '947', city: 'Troy', state: 'MI', timezone: 'America/New_York' },
  { areaCode: '989', city: 'Saginaw', state: 'MI', timezone: 'America/New_York' },
  
  // Minnesota
  { areaCode: '218', city: 'Duluth', state: 'MN', timezone: 'America/Chicago' },
  { areaCode: '320', city: 'St. Cloud', state: 'MN', timezone: 'America/Chicago' },
  { areaCode: '507', city: 'Rochester', state: 'MN', timezone: 'America/Chicago' },
  { areaCode: '612', city: 'Minneapolis', state: 'MN', timezone: 'America/Chicago' },
  { areaCode: '651', city: 'St. Paul', state: 'MN', timezone: 'America/Chicago' },
  { areaCode: '763', city: 'Brooklyn Park', state: 'MN', timezone: 'America/Chicago' },
  { areaCode: '952', city: 'Bloomington', state: 'MN', timezone: 'America/Chicago' },
  
  // Mississippi
  { areaCode: '228', city: 'Gulfport', state: 'MS', timezone: 'America/Chicago' },
  { areaCode: '601', city: 'Jackson', state: 'MS', timezone: 'America/Chicago' },
  { areaCode: '662', city: 'Tupelo', state: 'MS', timezone: 'America/Chicago' },
  { areaCode: '769', city: 'Jackson', state: 'MS', timezone: 'America/Chicago' },
  
  // Missouri
  { areaCode: '314', city: 'St. Louis', state: 'MO', timezone: 'America/Chicago' },
  { areaCode: '417', city: 'Springfield', state: 'MO', timezone: 'America/Chicago' },
  { areaCode: '573', city: 'Columbia', state: 'MO', timezone: 'America/Chicago' },
  { areaCode: '636', city: "O'Fallon", state: 'MO', timezone: 'America/Chicago' },
  { areaCode: '660', city: 'Sedalia', state: 'MO', timezone: 'America/Chicago' },
  { areaCode: '816', city: 'Kansas City', state: 'MO', timezone: 'America/Chicago' },
  
  // Montana
  { areaCode: '406', city: 'Billings', state: 'MT', timezone: 'America/Denver' },
  
  // Nebraska
  { areaCode: '308', city: 'Grand Island', state: 'NE', timezone: 'America/Chicago' },
  { areaCode: '402', city: 'Omaha', state: 'NE', timezone: 'America/Chicago' },
  { areaCode: '531', city: 'Omaha', state: 'NE', timezone: 'America/Chicago' },
  
  // Nevada
  { areaCode: '702', city: 'Las Vegas', state: 'NV', timezone: 'America/Los_Angeles' },
  { areaCode: '725', city: 'Las Vegas', state: 'NV', timezone: 'America/Los_Angeles' },
  { areaCode: '775', city: 'Reno', state: 'NV', timezone: 'America/Los_Angeles' },
  
  // New Hampshire
  { areaCode: '603', city: 'Manchester', state: 'NH', timezone: 'America/New_York' },
  
  // New Jersey
  { areaCode: '201', city: 'Jersey City', state: 'NJ', timezone: 'America/New_York' },
  { areaCode: '551', city: 'Jersey City', state: 'NJ', timezone: 'America/New_York' },
  { areaCode: '609', city: 'Trenton', state: 'NJ', timezone: 'America/New_York' },
  { areaCode: '640', city: 'Trenton', state: 'NJ', timezone: 'America/New_York' },
  { areaCode: '732', city: 'Toms River', state: 'NJ', timezone: 'America/New_York' },
  { areaCode: '848', city: 'Toms River', state: 'NJ', timezone: 'America/New_York' },
  { areaCode: '856', city: 'Camden', state: 'NJ', timezone: 'America/New_York' },
  { areaCode: '862', city: 'Newark', state: 'NJ', timezone: 'America/New_York' },
  { areaCode: '908', city: 'Elizabeth', state: 'NJ', timezone: 'America/New_York' },
  { areaCode: '973', city: 'Newark', state: 'NJ', timezone: 'America/New_York' },
  
  // New Mexico
  { areaCode: '505', city: 'Albuquerque', state: 'NM', timezone: 'America/Denver' },
  { areaCode: '575', city: 'Las Cruces', state: 'NM', timezone: 'America/Denver' },
  
  // New York
  { areaCode: '212', city: 'Manhattan', state: 'NY', timezone: 'America/New_York' },
  { areaCode: '315', city: 'Syracuse', state: 'NY', timezone: 'America/New_York' },
  { areaCode: '332', city: 'Manhattan', state: 'NY', timezone: 'America/New_York' },
  { areaCode: '347', city: 'Brooklyn', state: 'NY', timezone: 'America/New_York' },
  { areaCode: '363', city: 'Hempstead', state: 'NY', timezone: 'America/New_York' },
  { areaCode: '516', city: 'Hempstead', state: 'NY', timezone: 'America/New_York' },
  { areaCode: '518', city: 'Albany', state: 'NY', timezone: 'America/New_York' },
  { areaCode: '585', city: 'Rochester', state: 'NY', timezone: 'America/New_York' },
  { areaCode: '607', city: 'Binghamton', state: 'NY', timezone: 'America/New_York' },
  { areaCode: '631', city: 'Islip', state: 'NY', timezone: 'America/New_York' },
  { areaCode: '646', city: 'Manhattan', state: 'NY', timezone: 'America/New_York' },
  { areaCode: '680', city: 'Syracuse', state: 'NY', timezone: 'America/New_York' },
  { areaCode: '716', city: 'Buffalo', state: 'NY', timezone: 'America/New_York' },
  { areaCode: '718', city: 'Brooklyn', state: 'NY', timezone: 'America/New_York' },
  { areaCode: '838', city: 'Hempstead', state: 'NY', timezone: 'America/New_York' },
  { areaCode: '845', city: 'Poughkeepsie', state: 'NY', timezone: 'America/New_York' },
  { areaCode: '914', city: 'Yonkers', state: 'NY', timezone: 'America/New_York' },
  { areaCode: '917', city: 'New York', state: 'NY', timezone: 'America/New_York' },
  { areaCode: '929', city: 'Queens', state: 'NY', timezone: 'America/New_York' },
  
  // North Carolina
  { areaCode: '252', city: 'Greenville', state: 'NC', timezone: 'America/New_York' },
  { areaCode: '336', city: 'Greensboro', state: 'NC', timezone: 'America/New_York' },
  { areaCode: '704', city: 'Charlotte', state: 'NC', timezone: 'America/New_York' },
  { areaCode: '743', city: 'Greensboro', state: 'NC', timezone: 'America/New_York' },
  { areaCode: '828', city: 'Asheville', state: 'NC', timezone: 'America/New_York' },
  { areaCode: '910', city: 'Fayetteville', state: 'NC', timezone: 'America/New_York' },
  { areaCode: '919', city: 'Raleigh', state: 'NC', timezone: 'America/New_York' },
  { areaCode: '980', city: 'Charlotte', state: 'NC', timezone: 'America/New_York' },
  { areaCode: '984', city: 'Raleigh', state: 'NC', timezone: 'America/New_York' },
  
  // North Dakota
  { areaCode: '701', city: 'Fargo', state: 'ND', timezone: 'America/Chicago' },
  
  // Ohio
  { areaCode: '216', city: 'Cleveland', state: 'OH', timezone: 'America/New_York' },
  { areaCode: '220', city: 'Newark', state: 'OH', timezone: 'America/New_York' },
  { areaCode: '234', city: 'Akron', state: 'OH', timezone: 'America/New_York' },
  { areaCode: '283', city: 'Cincinnati', state: 'OH', timezone: 'America/New_York' },
  { areaCode: '326', city: 'Dayton', state: 'OH', timezone: 'America/New_York' },
  { areaCode: '330', city: 'Akron', state: 'OH', timezone: 'America/New_York' },
  { areaCode: '380', city: 'Columbus', state: 'OH', timezone: 'America/New_York' },
  { areaCode: '419', city: 'Toledo', state: 'OH', timezone: 'America/New_York' },
  { areaCode: '440', city: 'Parma', state: 'OH', timezone: 'America/New_York' },
  { areaCode: '513', city: 'Cincinnati', state: 'OH', timezone: 'America/New_York' },
  { areaCode: '567', city: 'Toledo', state: 'OH', timezone: 'America/New_York' },
  { areaCode: '614', city: 'Columbus', state: 'OH', timezone: 'America/New_York' },
  { areaCode: '740', city: 'Newark', state: 'OH', timezone: 'America/New_York' },
  { areaCode: '937', city: 'Dayton', state: 'OH', timezone: 'America/New_York' },
  
  // Oklahoma
  { areaCode: '405', city: 'Oklahoma City', state: 'OK', timezone: 'America/Chicago' },
  { areaCode: '539', city: 'Tulsa', state: 'OK', timezone: 'America/Chicago' },
  { areaCode: '572', city: 'Oklahoma City', state: 'OK', timezone: 'America/Chicago' },
  { areaCode: '580', city: 'Lawton', state: 'OK', timezone: 'America/Chicago' },
  { areaCode: '918', city: 'Tulsa', state: 'OK', timezone: 'America/Chicago' },
  
  // Oregon
  { areaCode: '458', city: 'Eugene', state: 'OR', timezone: 'America/Los_Angeles' },
  { areaCode: '503', city: 'Portland', state: 'OR', timezone: 'America/Los_Angeles' },
  { areaCode: '541', city: 'Eugene', state: 'OR', timezone: 'America/Los_Angeles' },
  { areaCode: '971', city: 'Portland', state: 'OR', timezone: 'America/Los_Angeles' },
  
  // Pennsylvania
  { areaCode: '215', city: 'Philadelphia', state: 'PA', timezone: 'America/New_York' },
  { areaCode: '223', city: 'Lancaster', state: 'PA', timezone: 'America/New_York' },
  { areaCode: '267', city: 'Philadelphia', state: 'PA', timezone: 'America/New_York' },
  { areaCode: '272', city: 'Scranton', state: 'PA', timezone: 'America/New_York' },
  { areaCode: '412', city: 'Pittsburgh', state: 'PA', timezone: 'America/New_York' },
  { areaCode: '445', city: 'Philadelphia', state: 'PA', timezone: 'America/New_York' },
  { areaCode: '484', city: 'Allentown', state: 'PA', timezone: 'America/New_York' },
  { areaCode: '570', city: 'Scranton', state: 'PA', timezone: 'America/New_York' },
  { areaCode: '582', city: 'Allentown', state: 'PA', timezone: 'America/New_York' },
  { areaCode: '610', city: 'Allentown', state: 'PA', timezone: 'America/New_York' },
  { areaCode: '717', city: 'Lancaster', state: 'PA', timezone: 'America/New_York' },
  { areaCode: '724', city: 'New Castle', state: 'PA', timezone: 'America/New_York' },
  { areaCode: '814', city: 'Erie', state: 'PA', timezone: 'America/New_York' },
  { areaCode: '878', city: 'Pittsburgh', state: 'PA', timezone: 'America/New_York' },
  
  // Rhode Island
  { areaCode: '401', city: 'Providence', state: 'RI', timezone: 'America/New_York' },
  
  // South Carolina
  { areaCode: '803', city: 'Columbia', state: 'SC', timezone: 'America/New_York' },
  { areaCode: '843', city: 'Charleston', state: 'SC', timezone: 'America/New_York' },
  { areaCode: '854', city: 'Charleston', state: 'SC', timezone: 'America/New_York' },
  { areaCode: '864', city: 'Greenville', state: 'SC', timezone: 'America/New_York' },
  
  // South Dakota
  { areaCode: '605', city: 'Sioux Falls', state: 'SD', timezone: 'America/Chicago' },
  
  // Tennessee
  { areaCode: '423', city: 'Chattanooga', state: 'TN', timezone: 'America/New_York' },
  { areaCode: '615', city: 'Nashville', state: 'TN', timezone: 'America/Chicago' },
  { areaCode: '629', city: 'Nashville', state: 'TN', timezone: 'America/Chicago' },
  { areaCode: '731', city: 'Jackson', state: 'TN', timezone: 'America/Chicago' },
  { areaCode: '865', city: 'Knoxville', state: 'TN', timezone: 'America/New_York' },
  { areaCode: '901', city: 'Memphis', state: 'TN', timezone: 'America/Chicago' },
  { areaCode: '931', city: 'Clarksville', state: 'TN', timezone: 'America/Chicago' },
  
  // Texas
  { areaCode: '210', city: 'San Antonio', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '214', city: 'Dallas', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '254', city: 'Waco', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '281', city: 'Houston', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '325', city: 'Abilene', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '346', city: 'Houston', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '361', city: 'Corpus Christi', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '409', city: 'Beaumont', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '430', city: 'Tyler', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '432', city: 'Midland', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '469', city: 'Dallas', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '512', city: 'Austin', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '682', city: 'Fort Worth', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '713', city: 'Houston', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '726', city: 'San Antonio', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '737', city: 'Austin', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '806', city: 'Lubbock', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '817', city: 'Fort Worth', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '830', city: 'New Braunfels', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '832', city: 'Houston', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '903', city: 'Tyler', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '915', city: 'El Paso', state: 'TX', timezone: 'America/Denver' },
  { areaCode: '936', city: 'Conroe', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '940', city: 'Wichita Falls', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '945', city: 'Dallas', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '956', city: 'Laredo', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '972', city: 'Dallas', state: 'TX', timezone: 'America/Chicago' },
  { areaCode: '979', city: 'College Station', state: 'TX', timezone: 'America/Chicago' },
  
  // Utah
  { areaCode: '385', city: 'Salt Lake City', state: 'UT', timezone: 'America/Denver' },
  { areaCode: '435', city: 'St. George', state: 'UT', timezone: 'America/Denver' },
  { areaCode: '801', city: 'Salt Lake City', state: 'UT', timezone: 'America/Denver' },
  
  // Vermont
  { areaCode: '802', city: 'Burlington', state: 'VT', timezone: 'America/New_York' },
  
  // Virginia
  { areaCode: '276', city: 'Bristol', state: 'VA', timezone: 'America/New_York' },
  { areaCode: '434', city: 'Lynchburg', state: 'VA', timezone: 'America/New_York' },
  { areaCode: '540', city: 'Roanoke', state: 'VA', timezone: 'America/New_York' },
  { areaCode: '571', city: 'Arlington', state: 'VA', timezone: 'America/New_York' },
  { areaCode: '703', city: 'Arlington', state: 'VA', timezone: 'America/New_York' },
  { areaCode: '757', city: 'Virginia Beach', state: 'VA', timezone: 'America/New_York' },
  { areaCode: '804', city: 'Richmond', state: 'VA', timezone: 'America/New_York' },
  
  // Washington
  { areaCode: '206', city: 'Seattle', state: 'WA', timezone: 'America/Los_Angeles' },
  { areaCode: '253', city: 'Tacoma', state: 'WA', timezone: 'America/Los_Angeles' },
  { areaCode: '360', city: 'Olympia', state: 'WA', timezone: 'America/Los_Angeles' },
  { areaCode: '425', city: 'Bellevue', state: 'WA', timezone: 'America/Los_Angeles' },
  { areaCode: '509', city: 'Spokane', state: 'WA', timezone: 'America/Los_Angeles' },
  { areaCode: '564', city: 'Olympia', state: 'WA', timezone: 'America/Los_Angeles' },
  
  // Washington, D.C.
  { areaCode: '202', city: 'Washington', state: 'DC', timezone: 'America/New_York' },
  
  // West Virginia
  { areaCode: '304', city: 'Charleston', state: 'WV', timezone: 'America/New_York' },
  { areaCode: '681', city: 'Charleston', state: 'WV', timezone: 'America/New_York' },
  
  // Wisconsin
  { areaCode: '262', city: 'Kenosha', state: 'WI', timezone: 'America/Chicago' },
  { areaCode: '274', city: 'Green Bay', state: 'WI', timezone: 'America/Chicago' },
  { areaCode: '414', city: 'Milwaukee', state: 'WI', timezone: 'America/Chicago' },
  { areaCode: '534', city: 'Eau Claire', state: 'WI', timezone: 'America/Chicago' },
  { areaCode: '608', city: 'Madison', state: 'WI', timezone: 'America/Chicago' },
  { areaCode: '715', city: 'Eau Claire', state: 'WI', timezone: 'America/Chicago' },
  { areaCode: '920', city: 'Green Bay', state: 'WI', timezone: 'America/Chicago' },
  
  // Wyoming
  { areaCode: '307', city: 'Cheyenne', state: 'WY', timezone: 'America/Denver' },
];

export interface PhoneLocationInfo {
  city: string;
  state: string;
  timezone: string;
  timeOffset: string;
  localTime: string;
}

export function getPhoneLocation(phoneNumber: string | null, userTimezone: string = 'America/New_York'): PhoneLocationInfo | null {
  if (!phoneNumber) return null;
  
  // Extract just the digits
  const digits = phoneNumber.replace(/\D/g, '');
  
  // Extract area code (first 3 digits after country code if present)
  let areaCode = '';
  if (digits.length === 11 && digits.startsWith('1')) {
    // US number with country code
    areaCode = digits.substring(1, 4);
  } else if (digits.length === 10) {
    // US number without country code
    areaCode = digits.substring(0, 3);
  } else {
    return null; // Invalid or non-US number
  }
  
  // Look up area code in database
  const locationData = areaCodeDatabase.find(data => data.areaCode === areaCode);
  
  if (!locationData) {
    return null; // Area code not found
  }
  
  // Calculate time offset
  const now = new Date();
  
  // Get current time in both timezones
  const userTime = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
  const phoneTime = new Date(now.toLocaleString('en-US', { timeZone: locationData.timezone }));
  
  // Calculate difference in hours
  const diffMs = phoneTime.getTime() - userTime.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  
  let timeOffsetStr = '';
  if (diffHours === 0) {
    timeOffsetStr = 'Same timezone';
  } else if (diffHours > 0) {
    timeOffsetStr = `+${diffHours}h`;
  } else {
    timeOffsetStr = `${diffHours}h`;
  }
  
  // Format the local time in the phone's timezone
  const localTimeStr = now.toLocaleTimeString('en-US', {
    timeZone: locationData.timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  return {
    city: locationData.city,
    state: locationData.state,
    timezone: locationData.timezone,
    timeOffset: timeOffsetStr,
    localTime: localTimeStr,
  };
}
