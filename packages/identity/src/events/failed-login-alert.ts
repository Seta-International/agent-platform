export const IDENTITY_FAILED_LOGIN_ALERT_THRESHOLD_REACHED =
  'identity.failed_login.alert_threshold_reached' as const;
export const IDENTITY_FAILED_LOGIN_ALERT_THRESHOLD_REACHED_VERSION = 1 as const;

export interface IdentityFailedLoginAlertThresholdReachedPayload {
  email: string;
  ip: string;
  geo_country: string | null;
  attempted_at: string;
  reset_url: string | null;
}
