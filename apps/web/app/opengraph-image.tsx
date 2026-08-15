import { ImageResponse } from "next/og";

export const alt =
  "Context Layer giving coding agents secure access to the context behind the code";
export const contentType = "image/png";
export const size = {
  height: 630,
  width: 1200,
};

const sourceCards = [
  { detail: "In review", label: "Jira · ENG-184" },
  { detail: "Checks passed", label: "GitHub · PR #482" },
  { detail: "Rollout plan", label: "Confluence" },
] as const;

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#fbfaf7",
        color: "#15130f",
        display: "flex",
        fontFamily: "Arial, sans-serif",
        height: "100%",
        overflow: "hidden",
        padding: "58px 64px",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          background:
            "radial-gradient(circle, rgba(90,65,232,0.17) 0%, rgba(90,65,232,0) 70%)",
          borderRadius: 999,
          display: "flex",
          height: 680,
          position: "absolute",
          right: -120,
          top: -210,
          width: 680,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 560,
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            fontSize: 23,
            fontWeight: 700,
            letterSpacing: "-0.03em",
          }}
        >
          <svg
            height="36"
            style={{ marginRight: 13 }}
            viewBox="0 0 32 32"
            width="36"
          >
            <rect width="32" height="32" fill="#17151b" />
            <path
              d="M8 8l5 5M24 8l-5 5M8 24l5-5M24 24l-5-5"
              fill="none"
              stroke="#806cf2"
              strokeLinecap="round"
              strokeWidth="2.5"
            />
            <g fill="#b5a9fa">
              <circle cx="7" cy="7" r="2.5" />
              <circle cx="25" cy="7" r="2.5" />
              <circle cx="7" cy="25" r="2.5" />
              <circle cx="25" cy="25" r="2.5" />
            </g>
            <rect
              x="11"
              y="11"
              width="10"
              height="10"
              rx="2"
              fill="#0b0a0d"
              stroke="#8a77f2"
            />
            <rect x="14" y="14" width="4" height="4" fill="#8a77f2" />
          </svg>
          Context Layer
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 65,
            fontWeight: 700,
            letterSpacing: "-0.065em",
            lineHeight: 0.98,
            marginTop: 72,
          }}
        >
          <span>Give agents the</span>
          <span>context behind</span>
          <span>the code.</span>
        </div>

        <div
          style={{
            color: "#68635a",
            display: "flex",
            fontSize: 23,
            lineHeight: 1.4,
            marginTop: 28,
            maxWidth: 510,
          }}
        >
          Permission-aware access to issues, code, and documentation through one
          MCP endpoint.
        </div>
      </div>

      <div
        style={{
          background: "rgba(255,255,255,0.9)",
          border: "1px solid #dcd7cc",
          boxShadow: "0 26px 70px rgba(44,37,63,0.14)",
          display: "flex",
          flexDirection: "column",
          marginLeft: 44,
          padding: 19,
          width: 470,
        }}
      >
        <div
          style={{
            alignItems: "center",
            borderBottom: "1px solid #e5e1d8",
            display: "flex",
            fontSize: 11,
            fontWeight: 700,
            justifyContent: "space-between",
            letterSpacing: "0.1em",
            paddingBottom: 13,
            textTransform: "uppercase",
          }}
        >
          <span>Illustrative workflow</span>
          <span style={{ color: "#777067" }}>MCP</span>
        </div>

        <div
          style={{
            alignSelf: "flex-end",
            background: "#fbfaf7",
            border: "1px solid #dcd7cc",
            display: "flex",
            flexDirection: "column",
            marginTop: 16,
            padding: "13px 16px",
            width: 285,
          }}
        >
          <span
            style={{
              color: "#777067",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
            }}
          >
            Coding agent
          </span>
          <span style={{ fontSize: 17, fontWeight: 700, marginTop: 5 }}>
            Can ENG-184 ship?
          </span>
        </div>

        <div
          style={{
            background: "#17151b",
            color: "white",
            display: "flex",
            flexDirection: "column",
            marginTop: 16,
            padding: "17px 18px",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              fontSize: 16,
              fontWeight: 700,
              justifyContent: "space-between",
            }}
          >
            <span>Context Layer</span>
            <span style={{ color: "#8cffbd", fontSize: 10 }}>
              ACCESS CHECKED
            </span>
          </div>
          <div
            style={{
              color: "#cfc9da",
              display: "flex",
              fontSize: 11,
              justifyContent: "space-between",
              marginTop: 15,
            }}
          >
            <span>Identity OK</span>
            <span>Bundle OK</span>
            <span>Scopes OK</span>
            <span>Tools OK</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
          {sourceCards.map((source) => (
            <div
              key={source.label}
              style={{
                border: "1px solid #ded9cf",
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
                padding: "10px 9px",
                width: 139,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700 }}>
                {source.label}
              </span>
              <span style={{ color: "#777067", fontSize: 9, marginTop: 4 }}>
                {source.detail}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            alignItems: "center",
            background: "#ffffff",
            border: "1px solid #ded9cf",
            display: "flex",
            justifyContent: "space-between",
            marginTop: 12,
            padding: "13px 15px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                color: "#15130f",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              Bitbucket · release/2.4
            </span>
            <span style={{ color: "#777067", fontSize: 9, marginTop: 4 }}>
              12 commits
            </span>
          </div>
          <span style={{ color: "#5a41e8", fontSize: 9, fontWeight: 700 }}>
            CONNECTED
          </span>
        </div>
      </div>
    </div>,
    size,
  );
}
