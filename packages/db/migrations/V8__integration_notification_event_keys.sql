alter table integrations
  add column "notificationEventKeys" text[] not null default '{}';

update integrations
  set "notificationEventKeys" = array[
    'jira.issue-assigned',
    'jira.issue-status-changed',
    'jira.issue-commented',
    'jira.issue-created',
    'jira.issue-priority-changed'
  ]
  where "notificationsEnabled" = true;

alter table integrations
  drop column "notificationsEnabled";
