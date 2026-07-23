// OAuth token cache
let cachedToken = null;
let tokenExpiry = null;

// Exchange client credentials for an access token
async function getAccessToken(clientId, clientSecret) {
  // Check if we have a valid cached token
  if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
    return cachedToken;
  }

  const response = await fetch('https://www.warcraftlogs.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OAuth token error:', errorText);
    throw new Error(`OAuth token request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  
  // Cache token for its lifetime (usually 1 hour)
  tokenExpiry = new Date(Date.now() + (data.expires_in * 1000));
  
  console.log('OAuth token obtained, expires in', data.expires_in, 'seconds');
  return cachedToken;
}

// Search for guild reports by guild ID, filter by owner and day of week
async function searchGuildReports(clientId, clientSecret) {
  const accessToken = await getAccessToken(clientId, clientSecret);

  const query = `
    query {
      reportData {
        reports(guildID: 823196, limit: 100) {
          data {
            code
            title
            startTime
            zone { id name }
            owner { name }
          }
        }
      }
    }
  `;

  console.log('Searching for guild reports from guild ID 823196...');

  const response = await fetch('https://www.warcraftlogs.com/api/v2/client', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('API Error Response:', errorText.substring(0, 500));
    throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
  }

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse response as JSON. Full response:', text);
    throw new Error('API returned invalid JSON. Check console for details.');
  }

  if (data.errors) {
    console.error('GraphQL Errors:', data.errors);
    throw new Error(`API Error: ${data.errors.map(err => err.message).join(', ')}`);
  }

  if (!data.data || !data.data.reportData || !data.data.reportData.reports) {
    console.error('Invalid report structure:', data);
    throw new Error('Invalid report data received from API');
  }

  const reports = data.data.reportData.reports.data || [];
  console.log(`Found ${reports.length} total reports for guild`);

  // Filter reports: owner must be "Torrezz" and must be Tuesday or Thursday
  const allowedDays = ['Tuesday', 'Thursday'];
  const filteredReports = reports.filter(report => {
    const isOwnerTorrezz = report.owner && report.owner.name === 'Torrezz';
    const reportDate = new Date(report.startTime);
    const dayName = reportDate.toLocaleDateString('en-US', { weekday: 'long' });
    const isDayAllowed = allowedDays.includes(dayName);
    
    console.log(`Report: ${report.code}, Owner: ${report.owner?.name}, Day: ${dayName}, Valid: ${isOwnerTorrezz && isDayAllowed}`);
    
    return isOwnerTorrezz && isDayAllowed;
  });

  console.log(`Filtered to ${filteredReports.length} reports from Torrezz on Tuesday/Thursday`);

  const reportCodes = filteredReports.map(report => report.code);
  console.log('Report codes:', reportCodes);

  return reportCodes;
}

// Fetch report using OAuth token
async function fetchReportRoster(reportCode, clientId, clientSecret) {
  const accessToken = await getAccessToken(clientId, clientSecret);

  const query = `
    query {
      reportData {
        report(code: "${reportCode}") {
          title
          startTime
          zone { name }
          rankedCharacters {
            id
            name
            classID
          }
        }
      }
    }
  `;

  console.log('Fetching report with code:', reportCode);

  const response = await fetch('https://www.warcraftlogs.com/api/v2/client', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ query })
  });

  console.log('API Response Status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('API Error Response:', errorText.substring(0, 500));
    throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
  }

  const text = await response.text();
  console.log('API Response Text:', text.substring(0, 500));

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse response as JSON. Full response:', text);
    throw new Error('API returned invalid JSON. Check console for details.');
  }

  if (data.errors) {
    console.error('GraphQL Errors:', data.errors);
    throw new Error(`API Error: ${data.errors.map(err => err.message).join(', ')}`);
  }

  if (!data.data || !data.data.reportData || !data.data.reportData.report) {
    console.error('Invalid report structure:', data);
    throw new Error('Invalid report data received from API');
  }

  const report = data.data.reportData.report;
  console.log('Report fetched successfully:', {
    title: report.title,
    zone: report.zone?.name || 'Unknown Zone',
    startTime: report.startTime,
    characterCount: (report.rankedCharacters || []).length // Safe fallback
    });
  });
  console.log('Characters:', report.rankedCharacters);

  return report;
}

// Logic to aggregate attendance across multiple reports
function calculateAttendance(reports) {
  const playerStats = {};
  
  console.log('Calculating attendance...');
  console.log('Total reports:', reports.length);

  const totalEligibleRaids = reports.length;

  reports.forEach(report => {
    // Safe navigation in case rankedCharacters is null or undefined
    const characters = report.rankedCharacters || [];
    const attendees = new Set(characters.map(c => c.name));

    console.log(`Processing raid: ${report.title}, Attendees:`, Array.from(attendees));
  
    attendees.forEach(name => {
      if (!playerStats[name]) {
        playerStats[name] = { attended: 0, missed: 0, percentage: 0 };
      }
      playerStats[name].attended += 1;
    });
  });

  // Calculate missed count and attendance percentage
  Object.keys(playerStats).forEach(name => {
    const attended = playerStats[name].attended;
    const missed = Math.max(0, totalEligibleRaids - attended);
    const percentage = totalEligibleRaids > 0 ? ((attended / totalEligibleRaids) * 100).toFixed(1) : 0;

    playerStats[name].missed = missed;
    playerStats[name].percentage = Number(percentage);
  });

  console.log('Final player stats:', playerStats);
  console.log('Total players:', Object.keys(playerStats).length);

  return { totalEligibleRaids, playerStats };
}

// Export for use in other modules
export { searchGuildReports, fetchReportRoster, calculateAttendance };
