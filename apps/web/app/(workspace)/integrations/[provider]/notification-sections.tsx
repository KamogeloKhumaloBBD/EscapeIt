import {
  BellRingingIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react/dist/ssr";

import { ProviderMark } from "@/components/integrations/provider-mark";
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
import type {
  NotificationChannel,
  NotificationPreference,
} from "@/lib/validation/notification";
import { AddChannelDialog } from "./add-channel-dialog";
import {
  DeleteChannelButton,
  PreferenceToggle,
  TestChannelButton,
} from "./notification-forms";

export function NotificationChannelsSection({
  channels,
}: {
  channels: NotificationChannel[];
}) {
  return (
    <Card className="relative overflow-visible">
      <CardHeader>
        <CardTitle>Connected channels</CardTitle>
        <CardDescription>
          Each channel receives every enabled event below.
        </CardDescription>
        <CardAction>
          <AddChannelDialog />
        </CardAction>
      </CardHeader>
      <CardContent>
        {channels.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BellRingingIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No Teams channels connected</EmptyTitle>
              <EmptyDescription>
                Connect a Microsoft Teams channel to start receiving workspace
                notifications.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="gap-0">
            {channels.map((channel, index) => (
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
                      {channel.status === "connected" ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-600">
                          <CheckCircleIcon aria-hidden="true" weight="fill" />
                          Connected
                        </span>
                      ) : (
                        (channel.lastErrorCode ?? "Not connected")
                      )}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="gap-2">
                    <TestChannelButton channelId={channel.id} />
                    <DeleteChannelButton
                      channelId={channel.id}
                      channelName={channel.name}
                    />
                  </ItemActions>
                </Item>
              </div>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}

export function NotificationEventsSection({
  preferences,
}: {
  preferences: NotificationPreference[];
}) {
  return (
    <Card className="relative overflow-visible">
      <CardHeader>
        <CardTitle>Events</CardTitle>
        <CardDescription>
          Choose which workspace events are sent to your connected channels.
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">
            {preferences.filter((preference) => preference.enabled).length}{" "}
            enabled
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {preferences.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No events available yet</EmptyTitle>
              <EmptyDescription>
                Notification events will appear here as they become available.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="gap-0">
            {preferences.map((preference, index) => (
              <div key={preference.eventKey}>
                {index > 0 ? <ItemSeparator /> : null}
                <Item>
                  <ItemContent>
                    <ItemTitle>{preference.displayName}</ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <PreferenceToggle
                      enabled={preference.enabled}
                      eventKey={preference.eventKey}
                    />
                  </ItemActions>
                </Item>
              </div>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}
