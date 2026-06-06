function isBusinessDay(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function addBusinessDays(startDate, businessDays) {
  const result = new Date(startDate);
  let added = 0;

  while (added < businessDays) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result)) added += 1;
  }

  return result;
}

function buildTrialSubscription(startDate = new Date()) {
  const expiresAt = addBusinessDays(startDate, 5);
  return {
    plan: 'professional',
    status: 'trialing',
    trialStartedAt: startDate,
    trialEndsAt: expiresAt,
    expiresAt,
  };
}

module.exports = { addBusinessDays, buildTrialSubscription, isBusinessDay };
