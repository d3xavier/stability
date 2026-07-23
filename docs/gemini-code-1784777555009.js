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

// Fetch report using OAuth token
async function fetchReportRoster(reportCode, clientId, clientSecret) {
  // First, get an access token
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
            class
          }
        }
      }
    }
  `;

  console.log('Fetching report with code:', reportCode);
  console.log('Using endpoint: https://www.warcraftlogs.com/api/v2/client');

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

  return data.data.reportData.report;
}

// Logic to aggregate attendance across multiple filtered logs
function calculateAttendance(reports, allowedDays, allowedRaids) {
  const playerStats = {};
  
  // Filter reports by selected day of week and raid instance
  const validReports = reports.filter(report => {
    const reportDay = new Date(report.startTime).toLocaleDateString('en-US', { weekday: 'long' });
    const isDayAllowed = allowedDays.includes(reportDay);
    const isRaidAllowed = allowedRaids.includes(report.zone.name);
    return isDayAllowed && isRaidAllowed;
  });

  const totalEligibleRaids = validReports.length;

  validReports.forEach(report => {
    // Unique list of characters who attended this specific raid
    const attendees = new Set(report.rankedCharacters.map(c => c.name));

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

  return { totalEligibleRaids, playerStats };
}

// Export for use in other modules
export { fetchReportRoster, calculateAttendance };
