import {
  BellRingingIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";

import { ProviderMark } from "@/components/integrations/provider-mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import type { NotificationChannel } from "@/lib/validation/notification";
import { notificationChannelHealth } from "@/lib/notification-health";
import { AddChannelDialog } from "./add-channel-dialog";
import { EditChannelDialog } from "./edit-channel-dialog";
import {
  ChannelSourceSelector,
  DeleteChannelButton,
  TestChannelButton,
} from "./notification-forms";

export interface NotificationSourceOption {
  displayName: string;
  provider: string;
}

export function NotificationChannelsSection({
  canManage,
  channels,
  errorMessage,
  providerDisplayName,
}: {
  canManage: boolean;
  channels: NotificationChannel[];
  errorMessage: string | null;
  providerDisplayName: string;
}) {
  return (
    <Card className="relative overflow-visible">
      <CardHeader>
        <CardTitle>Notification channels</CardTitle>
        <CardDescription>
          Configure which integrations each channel hears from in Routing below.
        </CardDescription>
        {canManage ? (
          <CardAction>
            <AddChannelDialog providerDisplayName={providerDisplayName} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {errorMessage !== null ? (
          <Alert variant="destructive">
            <WarningCircleIcon aria-hidden="true" />
            <AlertTitle>Channels unavailable</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : channels.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BellRingingIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No channels connected</EmptyTitle>
              <EmptyDescription>
                {canManage
                  ? `Connect a ${providerDisplayName} channel to start receiving workspace notifications.`
                  : `Ask a workspace owner to connect a ${providerDisplayName} channel.`}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="gap-0">
            {channels.map((channel, index) => {
              const health = notificationChannelHealth(channel);
              return (
                <div key={channel.id}>
                  {index > 0 ? <ItemSeparator /> : null}
                  <Item>
                    <ItemMedia>
                      <ProviderMark
                        displayName={channel.name}
                        provider={channel.provider}
                        size="sm"
                      />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{channel.name}</ItemTitle>
                      <ItemDescription>
                        {health.tone === "healthy" ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-600">
                            <CheckCircleIcon aria-hidden="true" weight="fill" />
                            {health.message}
                          </span>
                        ) : (
                          <span className="inline-flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                            <WarningCircleIcon
                              aria-hidden="true"
                              className="mt-0.5 shrink-0"
                              weight="fill"
                            />
                            {health.message}
                          </span>
                        )}
                      </ItemDescription>
                    </ItemContent>
                    {canManage ? (
                      <ItemActions className="w-full justify-end gap-2 sm:w-auto">
                        <TestChannelButton channelId={channel.id} />
                        <EditChannelDialog
                          channelId={channel.id}
                          channelName={channel.name}
                        />
                        <DeleteChannelButton
                          channelId={channel.id}
                          channelName={channel.name}
                          providerDisplayName={providerDisplayName}
                        />
                      </ItemActions>
                    ) : null}
                  </Item>
                </div>
              );
            })}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}

export function NotificationRoutingSection({
  canManage,
  channels,
  errorMessage,
  sourceOptions,
}: {
  canManage: boolean;
  channels: NotificationChannel[];
  errorMessage: string | null;
  sourceOptions: NotificationSourceOption[];
}) {
  return (
    <Card className="relative overflow-visible">
      <CardHeader>
        <CardTitle>Routing</CardTitle>
        <CardDescription>
          Choose which integrations each channel hears from. A channel with no
          integrations selected receives nothing.
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">{sourceOptions.length} available</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {errorMessage !== null ? (
          <Alert variant="destructive">
            <WarningCircleIcon aria-hidden="true" />
            <AlertTitle>Routing unavailable</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : channels.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No channels connected yet</EmptyTitle>
              <EmptyDescription>
                Connect a channel above to configure its routing.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : sourceOptions.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No integrations send notifications yet</EmptyTitle>
              <EmptyDescription>
                Turn on notifications for an integration to route its updates
                here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="gap-0">
            {channels.map((channel, channelIndex) => (
              <div key={channel.id}>
                {channelIndex > 0 ? <ItemSeparator /> : null}
                <div className="py-4">
                  <p className="text-sm font-semibold">{channel.name}</p>
                  <ChannelSourceSelector
                    channelId={channel.id}
                    currentSources={channel.sourceProviders}
                    disabled={!canManage}
                    options={sourceOptions}
                  />
                </div>
              </div>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}
