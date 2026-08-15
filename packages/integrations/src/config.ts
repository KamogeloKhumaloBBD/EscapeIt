export interface AtlassianOAuthConfig {
  clientId: string;
  clientSecret: string;
}

export interface BitbucketOAuthConfig {
  clientId: string;
  clientSecret: string;
}

export interface GitHubAppConfig {
  clientId: string;
  clientSecret: string;
  slug: string;
  webhookSecret: string | null;
}
