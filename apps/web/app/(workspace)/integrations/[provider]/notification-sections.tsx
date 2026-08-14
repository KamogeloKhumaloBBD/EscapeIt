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
import type { NotificationChannel } from "@/lib/validation/notification";
import { AddChannelDialog } from "./add-channel-dialog";
import {
  ChannelSourceToggle,
  DeleteChannelButton,
  TestChannelButton,
} from "./notification-forms";

export interface NotificationSourceOption {
  displayName: string;
  provider: string;
}

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
          Configure which integrations each channel hears from in Routing below.
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

export function NotificationRoutingSection({
  channels,
  sourceOptions,
}: {
  channels: NotificationChannel[];
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
        {channels.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No channels connected yet</EmptyTitle>
              <EmptyDescription>
                Connect a Teams channel above to configure its routing.
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
                  <div className="mt-3 divide-y divide-border">
                    {sourceOptions.map((option) => (
                      <Item className="px-0" key={option.provider}>
                        <ItemContent>
                          <ItemTitle>{option.displayName}</ItemTitle>
                        </ItemContent>
                        <ItemActions>
                          <ChannelSourceToggle
                            channelId={channel.id}
                            currentSources={channel.sourceProviders}
                            enabled={channel.sourceProviders.includes(
                              option.provider,
                            )}
                            provider={option.provider}
                          />
                        </ItemActions>
                      </Item>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}
