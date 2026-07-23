// Example helper logic for fetching report data from Warcraft Logs v2 API
async function fetchReportRoster(reportCode, accessToken) {
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

  const response = await fetch('https://fresh.warcraftlogs.com/api/v2/client', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
  }

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse response as JSON. Response text:', text.substring(0, 200));
    throw new Error('API returned invalid JSON. Check console for details and verify your API token is valid.');
  }

  if (data.errors) {
    throw new Error(`API Error: ${data.errors.map(err => err.message).join(', ')}`);
  }

  if (!data.data || !data.data.reportData || !data.data.reportData.report) {
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
