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

  const { data } = await response.json();
  return data.reportData.report;
}

// Logic to aggregate attendance across multiple filtered logs
function calculateAttendance(reports, allowedDays, allowedRaids) {
  const playerStats = {};
  
  // Filter reports by selected day of week and raid instance
  const validReports = reports.filter(report => {
    const reportDay = new Date(report.startTime).toLocaleDateString('en-US', { weekday: 'Monday' });
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