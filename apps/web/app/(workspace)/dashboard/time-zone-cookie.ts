export const dashboardTimeZoneCookieName = "dashboard_time_zone";
export const dashboardTimeZoneCookieMaxAge = 60 * 60 * 24 * 365;

export function parseDashboardTimeZone(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return undefined;
  }

  if (decoded.length === 0 || decoded.length > 100) return undefined;

  try {
    new Intl.DateTimeFormat("en", { timeZone: decoded }).format();
    return decoded;
  } catch {
    return undefined;
  }
}
